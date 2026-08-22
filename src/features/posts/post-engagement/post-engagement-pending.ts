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

const PENDING_ENGAGEMENT_RECORD_VERSION = "pending-engagement-record-v1" as const;
const PENDING_ENGAGEMENT_DB_NAME = "pirate-post-engagement-v1";
const PENDING_ENGAGEMENT_STORE_NAME = "pending-actions";

export type PendingEngagementAction =
  | { readonly kind: "comment"; readonly postId: string; readonly body: string; readonly idempotencyKey: string }
  | { readonly kind: "reply"; readonly commentId: string; readonly body: string; readonly idempotencyKey: string }
  | { readonly kind: "report"; readonly commentId: string; readonly reasonCode: CommentReportReason; readonly idempotencyKey: string }
  | { readonly kind: "moderate"; readonly caseRef: string; readonly action: CommentModerationAction; readonly idempotencyKey: string }
  | { readonly kind: "vote"; readonly postId: string; readonly value: -1 | 1; readonly idempotencyKey: string }
  | { readonly kind: "clear_vote"; readonly postId: string; readonly idempotencyKey: string };

export type PendingEngagementIssue =
  | { readonly kind: "idempotency_conflict"; readonly identity: string | null }
  | { readonly kind: "server_rejection"; readonly status: number; readonly code: string };

export interface PendingEngagementRecord {
  readonly version: typeof PENDING_ENGAGEMENT_RECORD_VERSION;
  readonly slot: string;
  readonly action_kind: PendingEngagementAction["kind"];
  readonly envelope: PendingSubmissionEnvelopeV1;
  readonly issue?: PendingEngagementIssue;
}

export interface PendingEngagementStorage {
  readonly load: (slot: string) => Promise<PendingEngagementRecord | null>;
  readonly saveNew: (record: PendingEngagementRecord) => Promise<void>;
  readonly save: (record: PendingEngagementRecord) => Promise<void>;
  readonly remove: (slot: string) => Promise<void>;
}

export interface MemoryPendingEngagementBacking {
  readonly records: Map<string, PendingEngagementRecord>;
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
const MODERATION_ACTIONS = ["approve", "dismiss", "hide", "remove", "restore"] as const;

interface RawPendingEngagementBody {
  readonly idempotency_key?: unknown;
  readonly body?: unknown;
  readonly reason_code?: unknown;
  readonly action?: unknown;
  readonly value?: unknown;
}

type PendingEngagementWireBody =
  | { readonly idempotency_key: string; readonly body: string }
  | { readonly idempotency_key: string; readonly reason_code: CommentReportReason }
  | { readonly idempotency_key: string; readonly action: CommentModerationAction }
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
  if (commentPostId !== null && exactObject(body, ["idempotency_key", "body"])) {
    return { kind: "comment", postId: commentPostId, body: requiredString(body.body, "body"), idempotencyKey };
  }
  const replyCommentId = matchPath(envelope.same_origin_path, /^\/api\/comments\/([^/]+)\/replies$/u, "commentId");
  if (replyCommentId !== null && exactObject(body, ["idempotency_key", "body"])) {
    return { kind: "reply", commentId: replyCommentId, body: requiredString(body.body, "body"), idempotencyKey };
  }
  const reportCommentId = matchPath(envelope.same_origin_path, /^\/api\/comments\/([^/]+)\/reports$/u, "commentId");
  if (reportCommentId !== null && exactObject(body, ["idempotency_key", "reason_code"])) {
    const reasonCode = REPORT_REASONS.find(reason => reason === body.reason_code);
    if (reasonCode === undefined) throw new PendingEngagementError("Invalid pending engagement field: reason_code");
    return { kind: "report", commentId: reportCommentId, reasonCode, idempotencyKey };
  }
  const caseRef = matchPath(envelope.same_origin_path, /^\/api\/moderation\/cases\/([^/]+)\/actions$/u, "caseRef");
  if (caseRef !== null && exactObject(body, ["idempotency_key", "action"])) {
    const action = MODERATION_ACTIONS.find(candidate => candidate === body.action);
    if (action === undefined) throw new PendingEngagementError("Invalid pending engagement field: action");
    return { kind: "moderate", caseRef, action, idempotencyKey };
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

export function commentSubmissionSlot(postId: string): string {
  return `post:${postId}:comment-submission`;
}

export function postVoteSlot(postId: string): string {
  return `post:${postId}:vote`;
}

export function commentReportSlot(commentId: string): string {
  return `comment:${commentId}:report`;
}

export function moderationCaseSlot(caseRef: string): string {
  return `case:${caseRef}:moderation`;
}

function actionRequest(action: PendingEngagementAction): PendingEngagementRequest {
  switch (action.kind) {
    case "comment": return {
      slot: commentSubmissionSlot(action.postId),
      path: `/api/posts/${encodeURIComponent(action.postId)}/comments`,
      body: { idempotency_key: action.idempotencyKey, body: action.body },
    };
    case "reply": return {
      slot: commentSubmissionSlot(action.commentId),
      path: `/api/comments/${encodeURIComponent(action.commentId)}/replies`,
      body: { idempotency_key: action.idempotencyKey, body: action.body },
    };
    case "report": return {
      slot: commentReportSlot(action.commentId),
      path: `/api/comments/${encodeURIComponent(action.commentId)}/reports`,
      body: { idempotency_key: action.idempotencyKey, reason_code: action.reasonCode },
    };
    case "moderate": return {
      slot: moderationCaseSlot(action.caseRef),
      path: `/api/moderation/cases/${encodeURIComponent(action.caseRef)}/actions`,
      body: { idempotency_key: action.idempotencyKey, action: action.action },
    };
    case "vote": return {
      slot: postVoteSlot(action.postId),
      path: `/api/posts/${encodeURIComponent(action.postId)}/vote`,
      body: { idempotency_key: action.idempotencyKey, value: action.value },
    };
    case "clear_vote": return {
      slot: postVoteSlot(action.postId),
      path: `/api/posts/${encodeURIComponent(action.postId)}/clear_vote`,
      body: { idempotency_key: action.idempotencyKey },
    };
  }
}

export async function createPendingEngagementRecord(
  action: PendingEngagementAction,
  createdAt = new Date().toISOString(),
  slotOverride?: string,
): Promise<PendingEngagementRecord> {
  const request = actionRequest(action);
  const slot = slotOverride ?? request.slot;
  if (slot === "") throw new PendingEngagementError("Pending engagement slot is empty");
  const bytes = new TextEncoder().encode(JSON.stringify(request.body));
  const envelope: PendingSubmissionEnvelopeV1 = {
    version: PENDING_SUBMISSION_VERSION,
    pending_request_id: slot,
    idempotency_key: action.idempotencyKey,
    method: "POST",
    same_origin_path: assertSafeSameOriginPath(request.path),
    content_type: PENDING_SUBMISSION_CONTENT_TYPE,
    body_utf8_base64url: bytesToBase64Url(bytes),
    body_sha256: await sha256Hex(bytes),
    submission_id: null,
    created_at: createdAt,
  };
  await validatePendingSubmissionEnvelope(envelope);
  return {
    version: PENDING_ENGAGEMENT_RECORD_VERSION,
    slot,
    action_kind: action.kind,
    envelope,
  };
}

async function validateRecord(value: unknown): Promise<PendingEngagementRecord> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new PendingEngagementError("Invalid pending engagement record");
  // SAFETY: the record representation was checked before its closed fields are parsed below.
  const raw = value as Partial<PendingEngagementRecord>;
  if (raw.version !== PENDING_ENGAGEMENT_RECORD_VERSION || typeof raw.slot !== "string" || raw.slot === "" || raw.envelope === undefined) {
    throw new PendingEngagementError("Unsupported pending engagement record");
  }
  const envelope = await validatePendingSubmissionEnvelope(raw.envelope);
  const action = await decodePendingEngagementAction(envelope);
  if (raw.slot !== envelope.pending_request_id || raw.action_kind !== action.kind) {
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
