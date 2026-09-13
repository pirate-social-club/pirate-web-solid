import { createApiClient, readCsrfCookie, sessionRequestOptions } from "../../../api/client.ts";
import { ApiClientError } from "@pirate/api-client";
import {
  decodeTextContentSubmission,
  TextSubmissionContractError,
  type TextContentSubmissionV1,
} from "./text-submission-contract";
import {
  assertSafeSameOriginPath,
  createPendingSubmissionEnvelope,
  pendingBodyBytes,
  PENDING_SUBMISSION_CONTENT_TYPE,
  PendingSubmissionError,
  type PendingSubmissionEnvelopeV1,
} from "./pending-submission";
import {
  initialPostComposerState,
  projectTextSubmission,
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

/**
 * Coordinates one text publication for the life of the composer operation.
 *
 * A request is retained in memory from the moment it is built until its
 * outcome is authoritative, so an ambiguous network result can be retried as
 * the exact same bytes and idempotency key instead of producing a second post.
 * Nothing survives the dialog; the product has no saved drafts.
 */
export class TextSubmissionCoordinator {
  readonly transport: TextSubmissionTransport;
  private currentState: PostComposerState = initialPostComposerState;
  private pending: PendingSubmissionEnvelopeV1 | null = null;
  private readonly createPendingRequestId: () => string;
  private readonly now: () => string;
  private readonly onStateChange?: (state: PostComposerState) => void;

  constructor(options: TextSubmissionCoordinatorOptions = {}) {
    this.transport = options.transport ?? createSameOriginTextSubmissionTransport({ origin: options.origin, fetchImpl: options.fetchImpl });
    this.createPendingRequestId = options.createPendingRequestId ?? createId;
    this.now = options.now ?? (() => new Date().toISOString());
    this.onStateChange = options.onStateChange;
  }

  get state(): PostComposerState {
    return this.currentState;
  }

  private setState(next: PostComposerState): PostComposerState {
    this.currentState = next;
    this.onStateChange?.(next);
    return next;
  }

  async submit(request: TextContentSubmissionRequestEnvelopeV1): Promise<TextContentSubmissionV1> {
    if (this.pending !== null) {
      throw new PendingSubmissionError("An unresolved submission must be reconciled before another can start");
    }
    let envelope: PendingSubmissionEnvelopeV1;
    try {
      envelope = await createPendingSubmissionEnvelope({
        request,
        pendingRequestId: this.createPendingRequestId(),
        createdAt: this.now(),
      });
    } catch (error) {
      const reason = error instanceof TextSubmissionContractError
        ? "local_validation_failed"
        : "serialization_failed";
      this.setState({ status: "transport_failure", reason });
      throw error;
    }
    this.pending = envelope;
    this.setState({ status: "submitting", pending_request_id: envelope.pending_request_id });
    return this.dispatchPending(envelope);
  }

  private async dispatchPending(envelope: PendingSubmissionEnvelopeV1): Promise<TextContentSubmissionV1> {
    let snapshot: TextContentSubmissionV1;
    try {
      snapshot = await this.transport.dispatch(envelope);
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        // The key is already bound to a submission. Keep the request so the
        // read below can learn the authoritative outcome; never rebuild it.
        this.pending = { ...envelope, submission_id: error.submission_id };
        this.setState({
          status: "reconciling",
          pending_request_id: envelope.pending_request_id,
          submission_id: error.submission_id,
        });
        throw error;
      }
      if (error instanceof TextSubmissionServerRejectionError && error.definitive) {
        // A definitive rejection cannot become a post; release the request and
        // let the author correct the still-open form.
        this.pending = null;
        this.setState({ status: "editing" });
        throw error;
      }
      this.setState({ status: "reconciling", pending_request_id: envelope.pending_request_id });
      throw error;
    }
    this.pending = null;
    this.setState(projectTextSubmission(snapshot));
    return snapshot;
  }

  /** Read the known submission, or replay the exact retained request. */
  async reconcile(): Promise<TextContentSubmissionV1> {
    const envelope = this.pending;
    if (envelope === null) throw new PendingSubmissionError("No unresolved text submission to reconcile");
    if (envelope.submission_id !== null) {
      const knownSnapshot = await this.transport.read(envelope.submission_id);
      if (knownSnapshot !== null) {
        this.pending = null;
        this.setState(projectTextSubmission(knownSnapshot));
        return knownSnapshot;
      }
    }
    return this.dispatchPending(envelope);
  }
}

export function createTextSubmissionCoordinator(options: TextSubmissionCoordinatorOptions = {}): TextSubmissionCoordinator {
  return new TextSubmissionCoordinator(options);
}

export function projectAuthoritativeTextSubmission(snapshot: TextContentSubmissionV1): PostComposerState {
  return projectTextSubmission(snapshot);
}
