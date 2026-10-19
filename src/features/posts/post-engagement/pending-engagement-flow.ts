import {
  isPostEngagementApiClientError,
  type CommentReportReason,
  type PostEngagementTransport,
} from "./post-engagement-api.ts";
import { mapEngagementIssue, type EngagementIssue } from "./post-engagement-model.ts";
import {
  createPendingEngagementRecord,
  decodePendingEngagementAction,
  postReportSlot,
  type PendingEngagementAction,
  type PendingEngagementIssue,
  type PendingEngagementRecord,
  type PendingEngagementStorage,
} from "./post-engagement-pending.ts";

/** The report reasons api-next accepts, with their reader-facing labels. */
export const REPORT_REASONS: ReadonlyArray<{ readonly value: CommentReportReason; readonly label: string }> = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "hate", label: "Hate" },
  { value: "sexual_content", label: "Sexual content" },
  { value: "graphic_content", label: "Graphic content" },
  { value: "misleading", label: "Misleading" },
  { value: "other", label: "Other" },
];

/** Storage that always fails, for browsers where durable storage cannot open. */
export function unavailablePendingStorage(): PendingEngagementStorage {
  const unavailable = async (): Promise<never> => { throw new Error("Durable pending storage is unavailable"); };
  return { load: unavailable, listForPost: unavailable, saveNew: unavailable, save: unavailable, remove: unavailable };
}

/** The reader-facing issue for a rejection retained in durable storage. */
export function issueFromPending(issue: PendingEngagementIssue): EngagementIssue {
  return issue.kind === "idempotency_conflict"
    ? { kind: "idempotency_conflict", identity: issue.identity }
    : issue.code === "auth_error"
      ? { kind: "auth_required" }
      : issue.code === "membership_required"
        ? { kind: "membership_required" }
        : issue.code === "not_found"
          ? { kind: "not_found" }
          : issue.code === "comments_locked"
            ? { kind: "comments_locked" }
            : issue.code === "gate_unsatisfied"
              ? { kind: "gate_unsatisfied" }
              : issue.code === "reply_depth_exceeded"
                ? { kind: "reply_depth_exceeded" }
                : issue.code === "bad_request"
                  ? { kind: "bad_request" }
                  : { kind: "conflict" };
}

/** True when two pending actions express the same user intent, ignoring the key. */
export function samePendingEngagementIntent(left: PendingEngagementAction, right: PendingEngagementAction): boolean {
  switch (left.kind) {
    case "comment": return right.kind === "comment" && left.postId === right.postId && left.personaId === right.personaId && left.body === right.body;
    case "reply": return right.kind === "reply" && left.commentId === right.commentId && left.personaId === right.personaId && left.body === right.body;
    case "post_report": return right.kind === "post_report" && left.postId === right.postId && left.reasonCode === right.reasonCode;
    case "report": return right.kind === "report" && left.commentId === right.commentId && left.reasonCode === right.reasonCode;
    case "moderate": return right.kind === "moderate"
      && left.caseRef === right.caseRef
      && left.action === right.action
      && left.expectedCaseRevision === right.expectedCaseRevision;
    case "vote": return right.kind === "vote" && left.postId === right.postId && left.value === right.value;
    case "clear_vote": return right.kind === "clear_vote" && left.postId === right.postId;
  }
}

export type PreparedPendingEngagement =
  /** Send this record; a retained record for the same intent keeps its key. */
  | { readonly kind: "ready"; readonly record: PendingEngagementRecord }
  /** A definitive server rejection is retained in this slot. */
  | { readonly kind: "rejected"; readonly record: PendingEngagementRecord; readonly issue: PendingEngagementIssue }
  /** A different unresolved intent occupies this slot. */
  | { readonly kind: "occupied"; readonly record: PendingEngagementRecord }
  | { readonly kind: "storage_failed" };

/**
 * Durable pending-envelope preparation shared by every engagement command.
 * An unresolved record for the same intent is reused so a retry replays its
 * idempotency key; otherwise a new record is committed before any request is
 * sent, and a lost commit race defers to the winner.
 */
export async function preparePendingEngagementRecord(input: {
  readonly storage: PendingEngagementStorage;
  readonly slot: string;
  readonly principalId: string;
  readonly postId: string;
  readonly generateKey: () => string;
  readonly createAction: (idempotencyKey: string) => PendingEngagementAction;
}): Promise<PreparedPendingEngagement> {
  const settleExisting = async (existing: PendingEngagementRecord): Promise<PreparedPendingEngagement> => {
    if (existing.issue !== undefined) return { kind: "rejected", record: existing, issue: existing.issue };
    const retained = await decodePendingEngagementAction(existing.envelope);
    return samePendingEngagementIntent(retained, input.createAction(retained.idempotencyKey))
      ? { kind: "ready", record: existing }
      : { kind: "occupied", record: existing };
  };
  try {
    const existing = await input.storage.load(input.slot);
    if (existing !== null) return await settleExisting(existing);
    const record = await createPendingEngagementRecord(input.createAction(input.generateKey()), {
      principalId: input.principalId,
      postId: input.postId,
    });
    try {
      await input.storage.saveNew(record);
      return { kind: "ready", record };
    } catch {
      const winner = await input.storage.load(input.slot);
      if (winner === null) throw new Error("Pending engagement record was not committed");
      return await settleExisting(winner);
    }
  } catch {
    return { kind: "storage_failed" };
  }
}

/**
 * The retained issue for a definitive rejection (idempotency conflict, 400,
 * 403), which must not be replayed; undefined when a retry may still succeed.
 */
export function definitiveRejectionIssue(error: unknown, projected: EngagementIssue = mapEngagementIssue(error)): PendingEngagementIssue | undefined {
  if (!isPostEngagementApiClientError(error) || error.retryable) return undefined;
  if (projected.kind === "idempotency_conflict") return { kind: "idempotency_conflict", identity: projected.identity };
  if (error.status === 400 || error.status === 403) return { kind: "server_rejection", status: error.status, code: error.code };
  return undefined;
}

export type PostReportOutcome =
  | { readonly kind: "reported" }
  /** Not sent or not accepted; a retryable failure keeps its idempotency key. */
  | { readonly kind: "failed"; readonly issue: EngagementIssue }
  /** Another report intent for this post is still unresolved. */
  | { readonly kind: "pending_other" }
  | { readonly kind: "storage_failed" };

/**
 * Reports a post through the durable pending envelope: one record per
 * viewer and post, sent with its idempotency key and removed once the
 * server answers. A retryable failure keeps the record, so trying the same
 * reason again replays the same key instead of filing a second report.
 */
export async function submitPostReport(input: {
  readonly principalId: string;
  readonly postId: string;
  readonly reasonCode: CommentReportReason;
  readonly transport: Pick<PostEngagementTransport, "reportPost">;
  readonly storage: PendingEngagementStorage;
  readonly generateKey: () => string;
}): Promise<PostReportOutcome> {
  const prepared = await preparePendingEngagementRecord({
    storage: input.storage,
    slot: postReportSlot(input.principalId, input.postId),
    principalId: input.principalId,
    postId: input.postId,
    generateKey: input.generateKey,
    createAction: key => ({ kind: "post_report", postId: input.postId, reasonCode: input.reasonCode, idempotencyKey: key }),
  });
  if (prepared.kind === "storage_failed") return { kind: "storage_failed" };
  if (prepared.kind === "occupied") return { kind: "pending_other" };
  if (prepared.kind === "rejected") return { kind: "failed", issue: issueFromPending(prepared.issue) };
  const record = prepared.record;
  try {
    await input.transport.reportPost(record.envelope);
  } catch (error) {
    const issue = mapEngagementIssue(error);
    const rejection = definitiveRejectionIssue(error, issue);
    if (rejection !== undefined) {
      try {
        await input.storage.save({ ...record, issue: rejection });
      } catch {
        return { kind: "storage_failed" };
      }
    }
    return { kind: "failed", issue };
  }
  try {
    await input.storage.remove(record.slot);
  } catch {
    // The server answer is authoritative; a retained key only replays it.
  }
  return { kind: "reported" };
}
