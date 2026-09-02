import { createApiClient, readCsrfCookie, sessionRequestOptions } from "../../../api/client.ts";
import { ApiClientError } from "@pirate/api-client-happy-path";
import {
  decodeTextContentSubmission,
  type TextContentSubmissionV1,
} from "./text-submission-contract";
import {
  assertSafeSameOriginPath,
  decodePendingSubmissionDraft,
  pendingBodyBytes,
  PENDING_SUBMISSION_CONTENT_TYPE,
  PENDING_SUBMISSION_RECORD_VERSION,
  PendingSubmissionError,
  PendingSubmissionStorageConflictError,
  type PendingSubmissionEnvelopeV1,
  type PendingSubmissionIssue,
  type PendingSubmissionStoredRecord,
  type PendingSubmissionStorage,
  createDefaultPendingSubmissionStorage,
  createPendingSubmissionEnvelope,
  isDiscardablePendingSubmissionIssue,
  isDefinitiveServerRejectionStatus,
} from "./pending-submission";
import {
  initialPostComposerState,
  projectTextSubmission,
  reducePostComposerState,
  type PostComposerState,
} from "./post-composer-state";
import type { TextContentSubmissionRequestEnvelopeV1 } from "./text-submission-contract";

export interface TextSubmissionTransport {
  readonly dispatch: (envelope: PendingSubmissionEnvelopeV1) => Promise<TextContentSubmissionV1>;
  readonly read: (submissionId: string) => Promise<TextContentSubmissionV1 | null>;
}

export class AmbiguousTextSubmissionError extends Error {
  constructor(message = "The submission result is uncertain") {
    super(message);
    this.name = "AmbiguousTextSubmissionError";
  }
}

export class IdempotencyConflictError extends Error {
  readonly submission_id: string;

  constructor(submissionId: string) {
    super("The idempotency key is already bound to a different request hash");
    this.name = "IdempotencyConflictError";
    this.submission_id = submissionId;
  }
}

export class TextSubmissionServerRejectionError extends Error {
  readonly status: number;
  readonly code: string;
  readonly definitive: boolean;

  constructor(status: number, code: string, definitive = false) {
    super(`The text submission was rejected with HTTP ${status}`);
    this.name = "TextSubmissionServerRejectionError";
    this.status = status;
    this.code = code;
    this.definitive = definitive || (
      (status === 400 && code === "bad_request")
      || (status === 403 && (code === "membership_required" || code === "gate_unsatisfied"))
      || (status === 404 && code === "not_found")
    );
  }
}

export interface SameOriginTextSubmissionTransportOptions {
  readonly fetchImpl?: TextSubmissionFetch;
  readonly origin?: string | URL;
}

export type TextSubmissionFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function resolveOrigin(origin: string | URL | undefined): string {
  const value = origin ?? (typeof location !== "undefined" ? location.origin : undefined);
  if (value !== undefined) {
    const parsed = new URL(value);
    if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "" || parsed.username !== "" || parsed.password !== "") {
      throw new AmbiguousTextSubmissionError("A client origin must be an origin, not a URL with a path");
    }
    return parsed.origin;
  }
  throw new AmbiguousTextSubmissionError("A browser origin is required for text submission");
}

interface RawWireObject {
  readonly error?: unknown;
  readonly code?: unknown;
  readonly message?: unknown;
  readonly retryable?: unknown;
  readonly details?: unknown;
  readonly request_id?: unknown;
}

type JsonPayload = null | boolean | number | string | JsonPayload[] | { readonly [key: string]: JsonPayload };

function isJsonPayload(value: unknown): value is JsonPayload {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return true;
  if (Array.isArray(value)) return value.every(isJsonPayload);
  if (typeof value !== "object") return false;
  return Object.values(value).every(isJsonPayload);
}

async function readJson(response: Response): Promise<JsonPayload> {
  const value = await response.json();
  if (!isJsonPayload(value)) throw new Error("Response is not valid JSON data");
  return value;
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

/**
 * The generated client owns this operation's error schema. POST remains
 * handwritten for exact-byte replay, so this is the same strict discriminator
 * applied locally to its 409 response. The old top-level `_tag` shape is not a
 * wire contract and is intentionally ambiguous.
 */
function conflictSubmissionId(value: unknown): string | null {
  if (!isRecord(value) || !Object.prototype.hasOwnProperty.call(value, "error")) return null;
  if (!(hasExactKeys(value, ["error"]) || hasExactKeys(value, ["error", "request_id"]))) return null;
  if (value.request_id !== undefined && typeof value.request_id !== "string") return null;
  if (!isRecord(value.error)) return null;
  const error = value.error;
  if (!hasExactKeys(error, ["code", "message", "retryable", "details"])) return null;
  if (error.code !== "conflict" || typeof error.message !== "string" || error.message === "" || error.retryable !== false) return null;
  if (!isRecord(error.details)) return null;
  // SAFETY: isRecord above established a non-null, non-array object; this
  // closed view only names the two discriminator fields checked immediately below.
  const details = error.details as { readonly reason_code?: unknown; readonly submission_id?: unknown };
  if (!hasExactKeys(details, ["reason_code", "submission_id"])) return null;
  if (details.reason_code !== "idempotency_conflict" || typeof details.submission_id !== "string" || details.submission_id === "") return null;
  return details.submission_id;
}

type DefinitiveServerRejectionCode = "bad_request" | "membership_required" | "gate_unsatisfied" | "not_found";

function isRecord(value: unknown): value is RawWireObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeDefinitiveServerRejection(status: number, value: unknown): DefinitiveServerRejectionCode | null {
  if (status !== 400 && status !== 403 && status !== 404) return null;
  if (!isRecord(value)) return null;
  const topLevelKeys = Object.keys(value);
  if (topLevelKeys.some(key => key !== "error" && key !== "request_id") || !Object.prototype.hasOwnProperty.call(value, "error")) return null;
  if (value.request_id !== undefined && typeof value.request_id !== "string") return null;
  if (!isRecord(value.error)) return null;
  const error = value.error;
  const errorKeys = Object.keys(error);
  if (errorKeys.some(key => !["code", "message", "retryable", "details"].includes(key))) return null;
  if (typeof error.code !== "string" || typeof error.message !== "string" || error.message === "" || error.retryable !== false) return null;
  if (error.details !== undefined && error.details !== null && !isRecord(error.details)) return null;
  if (status === 400) return error.code === "bad_request" ? error.code : null;
  if (status === 403) return error.code === "membership_required" || error.code === "gate_unsatisfied" ? error.code : null;
  return error.code === "not_found" ? error.code : null;
}

function isDefinitiveServerRejection(error: TextSubmissionServerRejectionError): error is TextSubmissionServerRejectionError & { readonly status: 400 | 403 | 404 } {
  return error.definitive && isDefinitiveServerRejectionStatus(error.status);
}

/**
 * Narrow same-origin adapter for exact-byte POST replay. The generated client
 * owns GET URL construction, status/error handling, and response validation.
 * POST and GET paths are both the api-next contract paths:
 * /api/communities/:id/posts and /api/text-content-submissions/:id.
 */
export function createSameOriginTextSubmissionTransport(
  options: SameOriginTextSubmissionTransportOptions = {},
): TextSubmissionTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async dispatch(envelope) {
      if (envelope.method !== "POST") throw new PendingSubmissionError("Pending submission method must be POST");
      if (envelope.content_type !== PENDING_SUBMISSION_CONTENT_TYPE) {
        throw new PendingSubmissionError("Pending submission content type is not application/json");
      }
      const origin = resolveOrigin(options.origin);
      const targetPath = assertSafeSameOriginPath(envelope.same_origin_path);
      const body = pendingBodyBytes(envelope);
      const headers = new Headers({
        accept: "application/json",
        "content-type": envelope.content_type,
      });
      const csrf = readCsrfCookie();
      const requestOptions = csrf === undefined
        ? { credentials: "same-origin" as const, headers }
        : sessionRequestOptions(csrf, { credentials: "same-origin", headers });
      // SAFETY: sessionRequestOptions returns the generated client's readonly
      // header tuple shape; Headers accepts the same string-pair values.
      const requestHeaders = new Headers(requestOptions.headers as HeadersInit);
      let response: Response;
      try {
        const target = new URL(targetPath, origin);
        if (target.origin !== origin) throw new AmbiguousTextSubmissionError("Text submission path escaped its origin");
        response = await fetchImpl(target, {
          method: envelope.method,
          // SAFETY: pendingBodyBytes always returns a fresh zero-offset
          // Uint8Array from base64url; its buffer is the exact retained body.
          body: body.buffer as ArrayBuffer,
          credentials: requestOptions.credentials,
          headers: requestHeaders,
        });
      } catch (error) {
        throw new AmbiguousTextSubmissionError(error instanceof Error ? error.message : "Network result is uncertain");
      }
      if (response.status === 409) {
        let payload = null;
        try { payload = await readJson(response); } catch { /* not a closed conflict response */ }
        const submissionId = conflictSubmissionId(payload);
        if (submissionId !== null) throw new IdempotencyConflictError(submissionId);
        throw new AmbiguousTextSubmissionError("Text submission returned an untyped HTTP 409");
      }
      if (response.status >= 400 && response.status < 500) {
        let payload = null;
        try { payload = await readJson(response); } catch {
          throw new AmbiguousTextSubmissionError(`Text submission returned malformed HTTP ${response.status}`);
        }
        const code = decodeDefinitiveServerRejection(response.status, payload);
        if (code === null) throw new AmbiguousTextSubmissionError(`Text submission returned an untyped HTTP ${response.status}`);
        throw new TextSubmissionServerRejectionError(response.status, code, true);
      }
      if (response.status >= 200 && response.status < 300 && response.status !== 201) {
        throw new TextSubmissionServerRejectionError(response.status, "unexpected_status");
      }
      if (!response.ok) {
        throw new AmbiguousTextSubmissionError(`Text submission returned HTTP ${response.status}`);
      }
      let payload: ReturnType<typeof readJson> extends Promise<infer T> ? T : never;
      try {
        payload = await readJson(response);
      } catch {
        throw new AmbiguousTextSubmissionError("Text submission returned malformed JSON");
      }
      try {
        return decodeTextContentSubmission(payload);
      } catch {
        throw new AmbiguousTextSubmissionError("Text submission returned a malformed success");
      }
    },
    async read(submissionId) {
      const origin = resolveOrigin(options.origin);
      const csrf = readCsrfCookie();
      const headers = new Headers({ accept: "application/json" });
      const requestOptions = csrf === undefined
        ? { credentials: "same-origin" as const, headers }
        : sessionRequestOptions(csrf, { credentials: "same-origin", headers });
      try {
        const generated = createApiClient({ origin, fetchImpl });
        const snapshot = await generated.get_textContentSubmissionsSubmissionId(
          { path: { submissionId } },
          requestOptions,
        );
        return decodeTextContentSubmission(snapshot);
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) return null;
        if (error instanceof AmbiguousTextSubmissionError) throw error;
        throw new AmbiguousTextSubmissionError(error instanceof Error ? error.message : "Network result is uncertain");
      }
    },
  };
}

export interface TextSubmissionCoordinatorOptions {
  readonly storage?: PendingSubmissionStorage;
  readonly principalId?: string;
  readonly transport?: TextSubmissionTransport;
  readonly origin?: string | URL;
  readonly fetchImpl?: TextSubmissionFetch;
  readonly createPendingRequestId?: () => string;
  readonly now?: () => string;
  readonly onStateChange?: (state: PostComposerState) => void;
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Coordinates durable-before-dispatch, exact replay, reload, and projection. */
export class TextSubmissionCoordinator {
  readonly storage: PendingSubmissionStorage;
  readonly transport: TextSubmissionTransport;
  private currentState: PostComposerState = initialPostComposerState;
  private pending: PendingSubmissionEnvelopeV1 | null = null;
  private pendingExactEnvelope: PendingSubmissionEnvelopeV1 | null = null;
  private readonly createPendingRequestId: () => string;
  private readonly now: () => string;
  private readonly onStateChange?: (state: PostComposerState) => void;

  constructor(options: TextSubmissionCoordinatorOptions = {}) {
    try {
      this.storage = options.storage ?? createDefaultPendingSubmissionStorage(options.principalId);
    } catch {
      this.storage = {
        load: async () => { throw new PendingSubmissionError("Durable pending storage is unavailable"); },
        loadAll: async () => { throw new PendingSubmissionError("Durable pending storage is unavailable"); },
        save: async () => { throw new PendingSubmissionError("Durable pending storage is unavailable"); },
        remove: async () => { throw new PendingSubmissionError("Durable pending storage is unavailable"); },
      };
      this.currentState = { status: "transport_failure", reason: "durable_storage_failed" };
    }
    this.transport = options.transport ?? createSameOriginTextSubmissionTransport({ origin: options.origin, fetchImpl: options.fetchImpl });
    this.createPendingRequestId = options.createPendingRequestId ?? createId;
    this.now = options.now ?? (() => new Date().toISOString());
    this.onStateChange = options.onStateChange;
  }

  get state(): PostComposerState {
    return this.currentState;
  }

  get pendingEnvelope(): PendingSubmissionEnvelopeV1 | null {
    return this.pending;
  }

  private setState(next: PostComposerState): PostComposerState {
    this.currentState = next;
    this.onStateChange?.(next);
    return next;
  }

  private async loadRecords(): Promise<readonly PendingSubmissionStoredRecord[]> {
    if (this.storage.loadAllRecords !== undefined) return this.storage.loadAllRecords();
    const envelopes = await this.storage.loadAll();
    return envelopes.map(envelope => ({
      version: PENDING_SUBMISSION_RECORD_VERSION,
      pending_request_id: envelope.pending_request_id,
      envelope,
      submission_id: envelope.submission_id,
    }));
  }

  private async saveRecord(record: PendingSubmissionStoredRecord): Promise<void> {
    if (this.storage.saveRecord !== undefined) {
      await this.storage.saveRecord(record);
      return;
    }
    if (record.issue !== undefined || record.submission_id !== record.envelope.submission_id) {
      throw new PendingSubmissionError("Pending storage cannot durably retain issue metadata");
    }
    // Legacy injected stores cannot retain issue metadata, but still preserve
    // exact bytes for ordinary injected-storage tests.
    await this.storage.save(record.envelope);
  }

  private async persistPendingMetadata(
    envelope: PendingSubmissionEnvelopeV1,
    metadata: { readonly issue?: PendingSubmissionIssue; readonly submission_id?: string | null },
  ): Promise<void> {
    const exactEnvelope = this.pendingExactEnvelope?.pending_request_id === envelope.pending_request_id
      ? this.pendingExactEnvelope
      : envelope;
    await this.saveRecord({
      version: PENDING_SUBMISSION_RECORD_VERSION,
      pending_request_id: envelope.pending_request_id,
      envelope: exactEnvelope,
      ...(metadata.issue === undefined ? {} : { issue: metadata.issue }),
      submission_id: metadata.submission_id ?? envelope.submission_id,
    });
  }

  private pendingState(
    envelope: PendingSubmissionEnvelopeV1,
    issue?: PendingSubmissionIssue | { readonly kind: "storage_conflict"; readonly record_count: number },
  ): PostComposerState {
    return {
      status: "reconciling",
      pending_request_id: envelope.pending_request_id,
      ...(envelope.submission_id === null ? {} : { submission_id: envelope.submission_id }),
      ...(issue === undefined ? {} : { issue }),
    };
  }

  private async adoptAfterSaveConflict(originalError: PendingSubmissionStorageConflictError): Promise<never> {
    let records: readonly PendingSubmissionStoredRecord[];
    try {
      records = await this.loadRecords();
    } catch {
      this.setState({ status: "transport_failure", reason: "durable_storage_failed" });
      throw originalError;
    }
    const ordered = [...records].sort((left, right) => left.envelope.created_at.localeCompare(right.envelope.created_at) || left.pending_request_id.localeCompare(right.pending_request_id));
    const unresolved = ordered[0];
    if (unresolved === undefined) {
      // The winner may have resolved and removed its record before the loser
      // could adopt it. Never dispatch the unpersisted loser request.
      this.setState({ status: "transport_failure", reason: "durable_storage_failed" });
      throw originalError;
    }
    const envelope = unresolved.submission_id !== unresolved.envelope.submission_id
      ? { ...unresolved.envelope, submission_id: unresolved.submission_id }
      : unresolved.envelope;
    this.pending = envelope;
    this.pendingExactEnvelope = unresolved.envelope;
    this.setState(this.pendingState(
      envelope,
      ordered.length > 1 ? { kind: "storage_conflict", record_count: ordered.length } : unresolved.issue,
    ));
    throw originalError;
  }

  private async saveBeforeDispatch(request: TextContentSubmissionRequestEnvelopeV1): Promise<PendingSubmissionEnvelopeV1> {
    let records: readonly PendingSubmissionStoredRecord[];
    try {
      records = await this.loadRecords();
    } catch (error) {
      this.setState({ status: "transport_failure", reason: "durable_storage_failed" });
      throw error;
    }
    if (records.length > 0) {
      const ordered = [...records].sort((left, right) => left.envelope.created_at.localeCompare(right.envelope.created_at) || left.pending_request_id.localeCompare(right.pending_request_id));
      const unresolved = ordered[0];
      if (unresolved !== undefined) {
        const envelope = unresolved.submission_id !== unresolved.envelope.submission_id
          ? { ...unresolved.envelope, submission_id: unresolved.submission_id }
          : unresolved.envelope;
        this.pending = envelope;
        this.pendingExactEnvelope = unresolved.envelope;
        const issue = ordered.length > 1
          ? { kind: "storage_conflict" as const, record_count: ordered.length }
          : unresolved.issue;
        this.setState(this.pendingState(envelope, issue));
      }
      throw new PendingSubmissionStorageConflictError(ordered.map(record => record.envelope));
    }
    let envelope: PendingSubmissionEnvelopeV1;
    try {
      envelope = await createPendingSubmissionEnvelope({
        request,
        pendingRequestId: this.createPendingRequestId(),
        createdAt: this.now(),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "TextSubmissionContractError"
        ? "local_validation_failed"
        : "serialization_failed";
      this.setState({ status: "transport_failure", reason });
      throw error;
    }
    try {
      await this.storage.save(envelope);
    } catch (error) {
      if (error instanceof PendingSubmissionStorageConflictError) return this.adoptAfterSaveConflict(error);
      this.setState({ status: "transport_failure", reason: "durable_storage_failed" });
      throw error;
    }
    this.pending = envelope;
    this.pendingExactEnvelope = envelope;
    this.setState(reducePostComposerState(this.currentState, {
      type: "submit_requested",
      pending_request_id: envelope.pending_request_id,
    }));
    return envelope;
  }

  private async dispatchPending(envelope: PendingSubmissionEnvelopeV1): Promise<TextContentSubmissionV1> {
    let snapshot: TextContentSubmissionV1;
    try {
      snapshot = await this.transport.dispatch(envelope);
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        try {
          await this.persistPendingMetadata(envelope, {
            issue: { kind: "idempotency_conflict", submission_id: error.submission_id },
            submission_id: error.submission_id,
          });
        } catch {
          this.pending = envelope;
          this.setState(reducePostComposerState(this.currentState, { type: "ambiguous_transport_observed" }));
          throw error;
        }
        this.pending = { ...envelope, submission_id: error.submission_id };
        this.setState({
          status: "reconciling",
          pending_request_id: envelope.pending_request_id,
          submission_id: error.submission_id,
          issue: { kind: "idempotency_conflict", submission_id: error.submission_id },
        });
        throw error;
      }
      if (error instanceof TextSubmissionServerRejectionError) {
        if (!isDefinitiveServerRejection(error)) {
          this.setState(reducePostComposerState(this.currentState, { type: "ambiguous_transport_observed" }));
          throw error;
        }
        try {
          await this.persistPendingMetadata(envelope, { issue: { kind: "server_rejection", status: error.status, code: error.code } });
        } catch {
          this.setState(reducePostComposerState(this.currentState, { type: "ambiguous_transport_observed" }));
          throw error;
        }
        this.setState({
          status: "reconciling",
          pending_request_id: envelope.pending_request_id,
          issue: { kind: "server_rejection", status: error.status, code: error.code },
        });
        throw error;
      }
      this.setState(reducePostComposerState(this.currentState, { type: "ambiguous_transport_observed" }));
      throw error;
    }
    // A decoded snapshot is authoritative even if browser cleanup is
    // temporarily unavailable. The retained record is safe to replay by key.
    try {
      await this.storage.remove(envelope.pending_request_id);
    } catch {
      // Cleanup is best effort after authority; it must not become a false
      // transport failure or replace the server-owned projection.
    }
    this.pending = null;
    this.pendingExactEnvelope = null;
    this.setState(reducePostComposerState(this.currentState, {
      type: "authoritative_snapshot_received",
      snapshot,
    }));
    return snapshot;
  }

  async submit(request: TextContentSubmissionRequestEnvelopeV1): Promise<TextContentSubmissionV1> {
    if (!this.canStartNewRequest()) throw new Error("An unresolved submission must remain separate from a new draft");
    const envelope = await this.saveBeforeDispatch(request);
    return this.dispatchPending(envelope);
  }

  async restore(): Promise<PostComposerState> {
    const records = await this.loadRecords();
    const ordered = [...records].sort((left, right) => left.envelope.created_at.localeCompare(right.envelope.created_at) || left.pending_request_id.localeCompare(right.pending_request_id));
    const unresolved = ordered[0];
    if (unresolved === undefined) {
      this.pending = null;
      this.pendingExactEnvelope = null;
      return this.setState(initialPostComposerState);
    }
    this.pending = unresolved.submission_id !== unresolved.envelope.submission_id
      ? { ...unresolved.envelope, submission_id: unresolved.submission_id }
      : unresolved.envelope;
    this.pendingExactEnvelope = unresolved.envelope;
    const issue = ordered.length > 1
      ? { kind: "storage_conflict" as const, record_count: ordered.length }
      : unresolved.issue;
    return this.setState(this.pendingState(this.pending, issue));
  }

  async reconcile(): Promise<TextContentSubmissionV1> {
    if (this.pending === null) {
      await this.restore();
    }
    if (this.pending === null) throw new Error("No pending text submission");
    if (this.currentState.status === "reconciling" && this.currentState.issue !== undefined) {
      throw new Error("This saved request requires explicit resolution before replay");
    }
    if (this.pending.submission_id !== null) {
      let knownSnapshot: TextContentSubmissionV1 | null;
      try {
        knownSnapshot = await this.transport.read(this.pending.submission_id);
      } catch (error) {
        this.setState(reducePostComposerState(this.currentState, { type: "reconciliation_attempt_ambiguous" }));
        throw error;
      }
      if (knownSnapshot !== null) return this.acceptAuthoritativeSnapshot(this.pending, knownSnapshot);
    }
    this.setState(reducePostComposerState(this.currentState, { type: "reconciliation_retry_requested" }));
    return this.dispatchPending(this.pending);
  }

  private async acceptAuthoritativeSnapshot(
    envelope: PendingSubmissionEnvelopeV1,
    snapshot: TextContentSubmissionV1,
  ): Promise<TextContentSubmissionV1> {
    try {
      await this.storage.remove(envelope.pending_request_id);
    } catch {
      // The server snapshot is authoritative; cleanup can be retried safely.
    }
    this.pending = null;
    this.pendingExactEnvelope = null;
    this.setState(reducePostComposerState(this.currentState, {
      type: "authoritative_snapshot_received",
      snapshot,
    }));
    return snapshot;
  }

  async discardRejectedRequest(): Promise<{ readonly communityId: string; readonly title: string; readonly body: string }> {
    if (this.pending === null) await this.restore();
    const state = this.currentState;
    if (
      this.pending === null
      || state.status !== "reconciling"
      || !isDiscardablePendingSubmissionIssue(state.issue)
    ) {
      throw new Error("Only a definitively rejected request may be discarded");
    }
    const draft = decodePendingSubmissionDraft(this.pending);
    await this.storage.remove(this.pending.pending_request_id);
    this.pending = null;
    this.pendingExactEnvelope = null;
    this.setState(reducePostComposerState(state, { type: "discard_rejected_request" }));
    return draft;
  }

  resolveOldestPending(): PostComposerState {
    return this.setState(reducePostComposerState(this.currentState, { type: "resolve_oldest_pending" }));
  }

  startNewDraft(): PostComposerState {
    if (this.currentState.status === "reconciling" && this.currentState.issue === undefined) {
      return this.setState(reducePostComposerState(this.currentState, { type: "new_local_draft_started" }));
    }
    if (this.currentState.status === "published" || this.currentState.status === "manual_review" || this.currentState.status === "blocked" || this.currentState.status === "abandoned") {
      return this.setState(initialPostComposerState);
    }
    return this.currentState;
  }

  private canStartNewRequest(): boolean {
    return this.currentState.status === "editing" || this.currentState.status === "transport_failure";
  }
}

export function createTextSubmissionCoordinator(options: TextSubmissionCoordinatorOptions = {}): TextSubmissionCoordinator {
  return new TextSubmissionCoordinator(options);
}

export function projectAuthoritativeTextSubmission(snapshot: TextContentSubmissionV1): PostComposerState {
  return projectTextSubmission(snapshot);
}
