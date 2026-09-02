import {
  assertSafeSameOriginPath,
  pendingBodyBytes,
  PENDING_SUBMISSION_CONTENT_TYPE,
  PENDING_SUBMISSION_VERSION,
  validatePendingSubmissionEnvelope,
  type PendingSubmissionEnvelopeV1,
} from "../post-composer/pending-submission.ts";
import {
  bytesToBase64Url,
  sha256Hex,
} from "../post-composer/text-submission-contract.ts";
import type {
  CommentModerationAction,
  CommentReportReason,
} from "./post-engagement-api.ts";

const PENDING_ENGAGEMENT_RECORD_VERSION = "pending-engagement-record-v3" as const;
const PENDING_ENGAGEMENT_DB_NAME = "pirate-post-engagement-v3";
const PENDING_ENGAGEMENT_STORE_NAME = "pending-actions";

export type PendingEngagementAction =
  | { readonly kind: "comment"; readonly postId: string; readonly personaId: string; readonly body: string; readonly idempotencyKey: string }
  | { readonly kind: "reply"; readonly commentId: string; readonly personaId: string; readonly body: string; readonly idempotencyKey: string }
  | { readonly kind: "report"; readonly commentId: string; readonly reasonCode: CommentReportReason; readonly idempotencyKey: string }
  | { readonly kind: "moderate"; readonly caseRef: string; readonly action: CommentModerationAction; readonly expectedCaseRevision: number; readonly idempotencyKey: string }
  | { readonly kind: "vote"; readonly postId: string; readonly value: -1 | 1; readonly idempotencyKey: string }
  | { readonly kind: "clear_vote"; readonly postId: string; readonly idempotencyKey: string };

export type PendingEngagementIssue =
  | { readonly kind: "idempotency_conflict"; readonly identity: string | null }
  | { readonly kind: "server_rejection"; readonly status: number; readonly code: string };

export interface PendingEngagementRecord {
  readonly version: typeof PENDING_ENGAGEMENT_RECORD_VERSION;
  readonly principal_id: string;
  readonly post_id: string;
  readonly slot: string;
  readonly action_kind: PendingEngagementAction["kind"];
  readonly envelope: PendingSubmissionEnvelopeV1;
  readonly issue?: PendingEngagementIssue;
}

export interface PendingEngagementStorage {
  readonly load: (slot: string) => Promise<PendingEngagementRecord | null>;
  readonly listForPost: (principalId: string, postId: string) => Promise<readonly PendingEngagementRecord[]>;
  readonly saveNew: (record: PendingEngagementRecord) => Promise<void>;
  readonly save: (record: PendingEngagementRecord) => Promise<void>;
  readonly remove: (slot: string) => Promise<void>;
}

export interface MemoryPendingEngagementBacking {
  readonly records: Map<string, PendingEngagementRecord>;
}

export interface PendingEngagementContext {
  readonly principalId: string;
  readonly postId: string;
  readonly createdAt?: string;
}

export class PendingEngagementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PendingEngagementError";
  }
}

export class PendingEngagementConflictError extends PendingEngagementError {
  readonly record: PendingEngagementRecord;

  constructor(record: PendingEngagementRecord) {
    super("An unresolved engagement action already occupies this slot");
    this.name = "PendingEngagementConflictError";
    this.record = record;
  }
}

const REPORT_REASONS = ["spam", "harassment", "hate", "sexual_content", "graphic_content", "misleading", "other"] as const;
const MODERATION_ACTIONS = ["approve_as_general", "approve_as_adult_18", "reject", "dismiss_report", "hide", "raise_rating_to_adult_18", "restore"] as const;

interface RawPendingEngagementBody {
  readonly idempotency_key?: unknown;
  readonly persona_id?: unknown;
  readonly version?: unknown;
  readonly body?: unknown;
  readonly reason_code?: unknown;
  readonly action?: unknown;
  readonly expected_case_revision?: unknown;
  readonly value?: unknown;
}

type PendingEngagementWireBody =
  | { readonly persona_id: string; readonly idempotency_key: string; readonly body: string }
  | { readonly idempotency_key: string; readonly reason_code: CommentReportReason }
  | { readonly version: "moderation-case-action-v2"; readonly idempotency_key: string; readonly expected_case_revision: number; readonly action: CommentModerationAction }
  | { readonly idempotency_key: string; readonly value: -1 | 1 }
  | { readonly idempotency_key: string };

interface PendingEngagementRequest {
  readonly slot: string;
  readonly path: string;
  readonly body: PendingEngagementWireBody;
}

function exactObject(value: RawPendingEngagementBody, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") throw new PendingEngagementError(`Invalid pending engagement field: ${field}`);
  return value;
}

function requiredCaseRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new PendingEngagementError("Invalid pending engagement field: expected_case_revision");
  }
  return value;
}

function decodePathSegment(value: string, field: string): string {
  try {
    return requiredString(decodeURIComponent(value), field);
  } catch (error) {
    if (error instanceof PendingEngagementError) throw error;
    throw new PendingEngagementError(`Invalid pending engagement field: ${field}`);
  }
}

function matchPath(path: string, pattern: RegExp, field: string): string | null {
  const match = pattern.exec(path);
  return match?.[1] === undefined ? null : decodePathSegment(match[1], field);
}

function parseBody(envelope: PendingSubmissionEnvelopeV1): RawPendingEngagementBody {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(pendingBodyBytes(envelope)));
  } catch {
    throw new PendingEngagementError("Pending engagement body is not valid UTF-8 JSON");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PendingEngagementError("Pending engagement body must be an object");
  }
  // SAFETY: the representation was established as a non-null, non-array object.
  return value as RawPendingEngagementBody;
}

export async function decodePendingEngagementAction(
  envelopeValue: PendingSubmissionEnvelopeV1,
): Promise<PendingEngagementAction> {
  const envelope = await validatePendingSubmissionEnvelope(envelopeValue);
  const body = parseBody(envelope);
  const idempotencyKey = requiredString(body.idempotency_key, "idempotency_key");
  if (idempotencyKey !== envelope.idempotency_key) {
    throw new PendingEngagementError("Pending engagement key does not match its body");
  }

  const commentPostId = matchPath(envelope.same_origin_path, /^\/api\/posts\/([^/]+)\/comments$/u, "postId");
  if (commentPostId !== null && exactObject(body, ["persona_id", "idempotency_key", "body"])) {
    return {
      kind: "comment",
      postId: commentPostId,
      personaId: requiredString(body.persona_id, "persona_id"),
      body: requiredString(body.body, "body"),
      idempotencyKey,
    };
  }
  const replyCommentId = matchPath(envelope.same_origin_path, /^\/api\/comments\/([^/]+)\/replies$/u, "commentId");
  if (replyCommentId !== null && exactObject(body, ["persona_id", "idempotency_key", "body"])) {
    return {
      kind: "reply",
      commentId: replyCommentId,
      personaId: requiredString(body.persona_id, "persona_id"),
      body: requiredString(body.body, "body"),
      idempotencyKey,
    };
  }
  const reportCommentId = matchPath(envelope.same_origin_path, /^\/api\/comments\/([^/]+)\/reports$/u, "commentId");
  if (reportCommentId !== null && exactObject(body, ["idempotency_key", "reason_code"])) {
    const reasonCode = REPORT_REASONS.find(reason => reason === body.reason_code);
    if (reasonCode === undefined) throw new PendingEngagementError("Invalid pending engagement field: reason_code");
    return { kind: "report", commentId: reportCommentId, reasonCode, idempotencyKey };
  }
  const caseRef = matchPath(envelope.same_origin_path, /^\/api\/moderation\/cases\/([^/]+)\/actions$/u, "caseRef");
  if (caseRef !== null && exactObject(body, ["version", "idempotency_key", "expected_case_revision", "action"])) {
    if (body.version !== "moderation-case-action-v2") throw new PendingEngagementError("Invalid pending engagement field: version");
    const action = MODERATION_ACTIONS.find(candidate => candidate === body.action);
    if (action === undefined) throw new PendingEngagementError("Invalid pending engagement field: action");
    return {
      kind: "moderate",
      caseRef,
      action,
      expectedCaseRevision: requiredCaseRevision(body.expected_case_revision),
      idempotencyKey,
    };
  }
  const votePostId = matchPath(envelope.same_origin_path, /^\/api\/posts\/([^/]+)\/vote$/u, "postId");
  if (votePostId !== null && exactObject(body, ["idempotency_key", "value"]) && (body.value === -1 || body.value === 1)) {
    return { kind: "vote", postId: votePostId, value: body.value, idempotencyKey };
  }
  const clearPostId = matchPath(envelope.same_origin_path, /^\/api\/posts\/([^/]+)\/clear_vote$/u, "postId");
  if (clearPostId !== null && exactObject(body, ["idempotency_key"])) {
    return { kind: "clear_vote", postId: clearPostId, idempotencyKey };
  }
  throw new PendingEngagementError("Pending engagement path and body do not form a declared action");
}

function scopedPostSlot(principalId: string, postId: string): string {
  return `principal:${encodeURIComponent(requiredString(principalId, "principalId"))}:post:${encodeURIComponent(requiredString(postId, "postId"))}`;
}

export function commentSubmissionSlot(principalId: string, postId: string): string {
  return `${scopedPostSlot(principalId, postId)}:comment-submission`;
}

export function postVoteSlot(principalId: string, postId: string): string {
  return `${scopedPostSlot(principalId, postId)}:vote`;
}

export function commentReportSlot(principalId: string, postId: string, commentId: string): string {
  return `${scopedPostSlot(principalId, postId)}:comment:${encodeURIComponent(requiredString(commentId, "commentId"))}:report`;
}

export function moderationCaseSlot(principalId: string, postId: string, caseRef: string): string {
  return `${scopedPostSlot(principalId, postId)}:case:${encodeURIComponent(requiredString(caseRef, "caseRef"))}:moderation`;
}

function actionRequest(action: PendingEngagementAction, context: PendingEngagementContext): PendingEngagementRequest {
  switch (action.kind) {
    case "comment": {
      if (action.postId !== context.postId) throw new PendingEngagementError("Pending comment post does not match its storage scope");
      return {
        slot: commentSubmissionSlot(context.principalId, context.postId),
        path: `/api/posts/${encodeURIComponent(action.postId)}/comments`,
        body: { persona_id: action.personaId, idempotency_key: action.idempotencyKey, body: action.body },
      };
    }
    case "reply": return {
      slot: commentSubmissionSlot(context.principalId, context.postId),
      path: `/api/comments/${encodeURIComponent(action.commentId)}/replies`,
      body: { persona_id: action.personaId, idempotency_key: action.idempotencyKey, body: action.body },
    };
    case "report": return {
      slot: commentReportSlot(context.principalId, context.postId, action.commentId),
      path: `/api/comments/${encodeURIComponent(action.commentId)}/reports`,
      body: { idempotency_key: action.idempotencyKey, reason_code: action.reasonCode },
    };
    case "moderate": return {
      slot: moderationCaseSlot(context.principalId, context.postId, action.caseRef),
      path: `/api/moderation/cases/${encodeURIComponent(action.caseRef)}/actions`,
      body: {
        version: "moderation-case-action-v2",
        idempotency_key: action.idempotencyKey,
        expected_case_revision: action.expectedCaseRevision,
        action: action.action,
      },
    };
    case "vote": {
      if (action.postId !== context.postId) throw new PendingEngagementError("Pending vote post does not match its storage scope");
      return {
        slot: postVoteSlot(context.principalId, context.postId),
        path: `/api/posts/${encodeURIComponent(action.postId)}/vote`,
        body: { idempotency_key: action.idempotencyKey, value: action.value },
      };
    }
    case "clear_vote": {
      if (action.postId !== context.postId) throw new PendingEngagementError("Pending clear-vote post does not match its storage scope");
      return {
        slot: postVoteSlot(context.principalId, context.postId),
        path: `/api/posts/${encodeURIComponent(action.postId)}/clear_vote`,
        body: { idempotency_key: action.idempotencyKey },
      };
    }
  }
}

export async function createPendingEngagementRecord(
  action: PendingEngagementAction,
  context: PendingEngagementContext,
): Promise<PendingEngagementRecord> {
  const principalId = requiredString(context.principalId, "principalId");
  const postId = requiredString(context.postId, "postId");
  const request = actionRequest(action, { principalId, postId });
  const bytes = new TextEncoder().encode(JSON.stringify(request.body));
  const envelope: PendingSubmissionEnvelopeV1 = {
    version: PENDING_SUBMISSION_VERSION,
    pending_request_id: request.slot,
    idempotency_key: action.idempotencyKey,
    method: "POST",
    same_origin_path: assertSafeSameOriginPath(request.path),
    content_type: PENDING_SUBMISSION_CONTENT_TYPE,
    body_utf8_base64url: bytesToBase64Url(bytes),
    body_sha256: await sha256Hex(bytes),
    submission_id: null,
    created_at: context.createdAt ?? new Date().toISOString(),
  };
  await validatePendingSubmissionEnvelope(envelope);
  return {
    version: PENDING_ENGAGEMENT_RECORD_VERSION,
    principal_id: principalId,
    post_id: postId,
    slot: request.slot,
    action_kind: action.kind,
    envelope,
  };
}

async function validateRecord(value: unknown): Promise<PendingEngagementRecord> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new PendingEngagementError("Invalid pending engagement record");
  // SAFETY: the record representation was checked before its closed fields are parsed below.
  const raw = value as Partial<PendingEngagementRecord>;
  if (
    raw.version !== PENDING_ENGAGEMENT_RECORD_VERSION
    || typeof raw.principal_id !== "string"
    || raw.principal_id === ""
    || typeof raw.post_id !== "string"
    || raw.post_id === ""
    || typeof raw.slot !== "string"
    || raw.slot === ""
    || raw.envelope === undefined
  ) {
    throw new PendingEngagementError("Unsupported pending engagement record");
  }
  const envelope = await validatePendingSubmissionEnvelope(raw.envelope);
  const action = await decodePendingEngagementAction(envelope);
  const expectedSlot = actionRequest(action, { principalId: raw.principal_id, postId: raw.post_id }).slot;
  if (raw.slot !== envelope.pending_request_id || raw.slot !== expectedSlot || raw.action_kind !== action.kind) {
    throw new PendingEngagementError("Pending engagement record identity does not match its envelope");
  }
  const issue = raw.issue;
  if (issue !== undefined) {
    if (issue.kind === "idempotency_conflict") {
      if (issue.identity !== null && (typeof issue.identity !== "string" || issue.identity === "")) throw new PendingEngagementError("Invalid pending engagement conflict identity");
    } else if (issue.kind === "server_rejection") {
      if (!Number.isInteger(issue.status) || typeof issue.code !== "string" || issue.code === "") throw new PendingEngagementError("Invalid pending engagement rejection");
    } else {
      throw new PendingEngagementError("Invalid pending engagement issue");
    }
  }
  return {
    version: PENDING_ENGAGEMENT_RECORD_VERSION,
    principal_id: raw.principal_id,
    post_id: raw.post_id,
    slot: raw.slot,
    action_kind: action.kind,
    envelope,
    ...(issue === undefined ? {} : { issue }),
  };
}

export function createMemoryPendingEngagementStorage(
  backing: MemoryPendingEngagementBacking = { records: new Map() },
): PendingEngagementStorage & MemoryPendingEngagementBacking {
  return {
    records: backing.records,
    async load(slot) {
      const value = backing.records.get(slot);
      return value === undefined ? null : validateRecord(value);
    },
    async listForPost(principalId, postId) {
      const records = await Promise.all([...backing.records.values()].map(validateRecord));
      return records
        .filter(record => record.principal_id === principalId && record.post_id === postId)
        .sort((left, right) => left.envelope.created_at.localeCompare(right.envelope.created_at));
    },
    async saveNew(record) {
      const decoded = await validateRecord(record);
      const existing = backing.records.get(decoded.slot);
      if (existing !== undefined) throw new PendingEngagementConflictError(await validateRecord(existing));
      backing.records.set(decoded.slot, decoded);
    },
    async save(record) {
      const decoded = await validateRecord(record);
      backing.records.set(decoded.slot, decoded);
    },
    async remove(slot) {
      backing.records.delete(slot);
    },
  };
}

export function createIndexedDbPendingEngagementStorage(indexedDb: IDBFactory = globalThis.indexedDB): PendingEngagementStorage {
  if (indexedDb === undefined) throw new PendingEngagementError("IndexedDB is unavailable");
  const open = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const request = indexedDb.open(PENDING_ENGAGEMENT_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(PENDING_ENGAGEMENT_STORE_NAME, { keyPath: "slot" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new PendingEngagementError("IndexedDB open failed"));
  });
  const request = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const database = await open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(PENDING_ENGAGEMENT_STORE_NAME, mode);
      const operation = action(transaction.objectStore(PENDING_ENGAGEMENT_STORE_NAME));
      operation.onsuccess = () => { /* Wait for transaction commit. */ };
      operation.onerror = () => { /* Transaction handlers own rejection. */ };
      transaction.oncomplete = () => { database.close(); resolve(operation.result); };
      transaction.onerror = () => { database.close(); reject(transaction.error ?? operation.error ?? new PendingEngagementError("IndexedDB transaction failed")); };
      transaction.onabort = () => { database.close(); reject(transaction.error ?? operation.error ?? new PendingEngagementError("IndexedDB transaction aborted")); };
    });
  };
  return {
    async load(slot) {
      const value = await request<unknown>("readonly", store => store.get(slot));
      return value === undefined ? null : validateRecord(value);
    },
    async listForPost(principalId, postId) {
      const values = await request<unknown[]>("readonly", store => store.getAll());
      const records = await Promise.all(values.map(validateRecord));
      return records
        .filter(record => record.principal_id === principalId && record.post_id === postId)
        .sort((left, right) => left.envelope.created_at.localeCompare(right.envelope.created_at));
    },
    async saveNew(record) {
      const decoded = await validateRecord(record);
      try {
        await request<IDBValidKey>("readwrite", store => store.add(decoded));
      } catch (error) {
        const existing = await this.load(decoded.slot);
        if (existing !== null) throw new PendingEngagementConflictError(existing);
        throw error;
      }
    },
    async save(record) {
      const decoded = await validateRecord(record);
      await request<IDBValidKey>("readwrite", store => store.put(decoded));
    },
    async remove(slot) {
      await request<undefined>("readwrite", store => store.delete(slot));
    },
  };
}

export function createDefaultPendingEngagementStorage(): PendingEngagementStorage {
  if (typeof window === "undefined") return createMemoryPendingEngagementStorage();
  return createIndexedDbPendingEngagementStorage();
}
