import {
  ApiClientError,
  type CreateCommentReplyResponse,
  type CreateCommentResponse,
  type ModerateCaseActionResponse,
} from "@pirate/api-client";

import { PostEngagementLocalError } from "./post-engagement-api.ts";

export type CommentSubmissionResponse = CreateCommentResponse | CreateCommentReplyResponse;

export type CommentDisplayState =
  | "submitting"
  | "published"
  | "manual_review"
  | "blocked"
  | "hidden"
  | "removed"
  | "restored";

export interface CommentThreadItem {
  readonly id: string;
  readonly submissionId: string | null;
  readonly parentId: string | null;
  readonly body: string;
  readonly depth: number;
  readonly replyCount: number;
  readonly state: CommentDisplayState;
  readonly caseRef: string | null;
  readonly href: string | null;
  readonly reportState?: "open" | "coalesced";
  readonly lastModerationAction?: ModerateCaseActionResponse["action"];
}

export type EngagementIssue =
  | { readonly kind: "auth_required" }
  | { readonly kind: "csrf_missing" }
  | { readonly kind: "membership_required" }
  | { readonly kind: "not_found" }
  | { readonly kind: "comments_locked" }
  | { readonly kind: "gate_unsatisfied" }
  | { readonly kind: "reply_depth_exceeded" }
  | { readonly kind: "idempotency_conflict"; readonly identity: string | null }
  | { readonly kind: "rate_limited"; readonly retryAfterSeconds: number | undefined }
  | { readonly kind: "conflict" }
  | { readonly kind: "bad_request" }
  | { readonly kind: "unavailable" };

export function mapEngagementIssue(error: unknown): EngagementIssue {
  if (error instanceof PostEngagementLocalError) return { kind: "csrf_missing" };
  if (!(error instanceof ApiClientError)) return { kind: "unavailable" };
  if (error.declaredName === "IdempotencyConflict") {
    const identity = error.details?.submission_id;
    return { kind: "idempotency_conflict", identity: typeof identity === "string" && identity !== "" ? identity : null };
  }
  if (error.declaredName === "PostVoteIdempotencyConflict") {
    const identity = error.details?.action_id;
    return { kind: "idempotency_conflict", identity: typeof identity === "string" && identity !== "" ? identity : null };
  }
  switch (error.code) {
    case "auth_error": return { kind: "auth_required" };
    case "membership_required": return { kind: "membership_required" };
    case "not_found": return { kind: "not_found" };
    case "comments_locked": return { kind: "comments_locked" };
    case "gate_unsatisfied": return { kind: "gate_unsatisfied" };
    case "reply_depth_exceeded": return { kind: "reply_depth_exceeded" };
    case "rate_limited": return { kind: "rate_limited", retryAfterSeconds: error.retryAfterSeconds };
    case "conflict": return { kind: "conflict" };
    case "bad_request": return { kind: "bad_request" };
    default: return { kind: "unavailable" };
  }
}

export function engagementIssueMessage(issue: EngagementIssue): string {
  switch (issue.kind) {
    case "auth_required": return "Sign in again before continuing.";
    case "csrf_missing": return "Refresh this page before continuing.";
    case "membership_required": return "Join this community before participating.";
    case "not_found": return "This post or comment is no longer available.";
    case "comments_locked": return "Comments are locked for this post.";
    case "gate_unsatisfied": return "Complete this community's participation requirements first.";
    case "reply_depth_exceeded": return "This reply would exceed the maximum thread depth.";
    case "idempotency_conflict": return "This action key was already used for different content.";
    case "rate_limited": return issue.retryAfterSeconds
      ? `Try again in ${issue.retryAfterSeconds} seconds.`
      : "Too many actions. Try again shortly.";
    case "conflict": return "The comment changed before this action completed. Refresh and try again.";
    case "bad_request": return "Check the comment and try again.";
    case "unavailable": return "The action could not be confirmed. Retrying will reuse the same action key.";
  }
}

export function submittingComment(
  body: string,
  depth: number,
  parentId: string | null,
  idempotencyKey: string,
): CommentThreadItem {
  return {
    id: `pending:${idempotencyKey}`,
    submissionId: null,
    parentId,
    body,
    depth,
    replyCount: 0,
    state: "submitting",
    caseRef: null,
    href: null,
  };
}

export function settledComment(
  pending: CommentThreadItem,
  response: CommentSubmissionResponse,
): CommentThreadItem {
  const publishedComment = response.published_resource?.kind === "comment"
    ? response.published_resource
    : null;
  return {
    ...pending,
    id: publishedComment?.comment_id ?? `submission:${response.submission_id}`,
    submissionId: response.submission_id,
    state: response.status,
    caseRef: response.review_ref,
    href: publishedComment?.href ?? response.href,
  };
}

export function applyModerationOutcome(
  item: CommentThreadItem,
  outcome: ModerateCaseActionResponse,
): CommentThreadItem {
  const state: CommentDisplayState = outcome.action === "hide"
    ? "hidden"
    : outcome.action === "remove"
      ? "removed"
      : outcome.action === "restore"
        ? "restored"
        : outcome.action === "approve"
          ? "published"
          : "manual_review";
  return {
    ...item,
    state,
    caseRef: null,
    lastModerationAction: outcome.action,
  };
}

export function canReplyToComment(item: CommentThreadItem): boolean {
  return (item.state === "published" || item.state === "restored") && item.depth < 8;
}

export function commentCountsAsPublished(item: CommentThreadItem): boolean {
  return item.state === "published" || item.state === "restored";
}

export function adjustReplyCount(
  items: readonly CommentThreadItem[],
  parentId: string,
  delta: -1 | 1,
): readonly CommentThreadItem[] {
  return items.map(item => item.id === parentId
    ? { ...item, replyCount: Math.max(0, item.replyCount + delta) }
    : item);
}

export function nextVoteScore(currentScore: number, currentVote: -1 | 1 | null, nextVote: -1 | 1 | null): number {
  return currentScore + (nextVote ?? 0) - (currentVote ?? 0);
}
