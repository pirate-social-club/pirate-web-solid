import type { TextContentSubmissionV1 } from "./text-submission-contract";
import type { PendingSubmissionIssue } from "./pending-submission";

export type TransportFailureReason = "local_validation_failed" | "serialization_failed" | "durable_storage_failed";

export type ReconciliationIssue =
  | PendingSubmissionIssue
  | { readonly kind: "storage_conflict"; readonly record_count: number };

/** Closed Solid projection for the text creation operation in spec 013 §8. */
export type PostComposerState =
  | { readonly status: "editing" }
  | { readonly status: "submitting"; readonly pending_request_id: string }
  | {
      readonly status: "reconciling";
      readonly pending_request_id: string;
      readonly submission_id?: string;
      readonly issue?: ReconciliationIssue;
    }
  | { readonly status: "published"; readonly submission_id: string; readonly post_href: string }
  | {
      readonly status: "manual_review";
      readonly submission_id: string;
      readonly reason_code: "review_required" | "moderation_unavailable";
      readonly review_ref: string;
    }
  | { readonly status: "blocked"; readonly submission_id: string }
  | { readonly status: "abandoned"; readonly submission_id: string }
  | { readonly status: "transport_failure"; readonly reason: TransportFailureReason };

export type PostComposerViewState = PostComposerState;

export type PostComposerEvent =
  | { readonly type: "submit_requested"; readonly pending_request_id: string }
  | { readonly type: "authoritative_snapshot_received"; readonly snapshot: TextContentSubmissionV1 }
  | { readonly type: "ambiguous_transport_observed" }
  | { readonly type: "pre_dispatch_failure"; readonly reason: TransportFailureReason }
  | { readonly type: "reconciliation_attempt_ambiguous" }
  | { readonly type: "reconciliation_retry_requested" }
  | { readonly type: "new_local_draft_started" }
  | { readonly type: "resolve_oldest_pending" }
  | { readonly type: "discard_rejected_request" }
  | { readonly type: "retry_requested"; readonly pending_request_id: string }
  | { readonly type: "edit_requested" };

export const initialPostComposerState: PostComposerState = { status: "editing" };

function projectedSnapshot(snapshot: TextContentSubmissionV1): PostComposerState {
  switch (snapshot.status) {
    case "published":
      if (snapshot.published_resource?.kind !== "post") {
        throw new Error("Published text post snapshot is missing its post resource");
      }
      return {
        status: "published",
        submission_id: snapshot.submission_id,
        post_href: snapshot.published_resource.href,
      };
    case "manual_review":
      if (snapshot.review_ref === null || snapshot.result.reason_code === null || snapshot.result.reason_code === "policy_violation") {
        throw new Error("Manual-review text snapshot is missing review evidence");
      }
      return {
        status: "manual_review",
        submission_id: snapshot.submission_id,
        reason_code: snapshot.result.reason_code,
        review_ref: snapshot.review_ref,
      };
    case "blocked":
      return { status: "blocked", submission_id: snapshot.submission_id };
  }
}

export function projectTextSubmission(snapshot: TextContentSubmissionV1): PostComposerState {
  return projectedSnapshot(snapshot);
}

function canDispatch(state: PostComposerState): boolean {
  return state.status === "editing" || state.status === "transport_failure";
}

function isPending(state: PostComposerState): state is Extract<PostComposerState, { status: "submitting" | "reconciling" }> {
  return state.status === "submitting" || state.status === "reconciling";
}

/** Reducer implementing the normative Solid transitions from spec 013 §8. */
export function reducePostComposerState(
  state: PostComposerState,
  event: PostComposerEvent,
): PostComposerState {
  switch (event.type) {
    case "submit_requested":
      return canDispatch(state) ? { status: "submitting", pending_request_id: event.pending_request_id } : state;
    case "authoritative_snapshot_received":
      return isPending(state) ? projectedSnapshot(event.snapshot) : state;
    case "ambiguous_transport_observed":
      return state.status === "submitting"
        ? { status: "reconciling", pending_request_id: state.pending_request_id }
        : state;
    case "pre_dispatch_failure":
      return state.status === "editing" || state.status === "submitting"
        ? { status: "transport_failure", reason: event.reason }
        : state;
    case "reconciliation_attempt_ambiguous":
    case "reconciliation_retry_requested":
      return state;
    case "new_local_draft_started":
      return state.status === "reconciling" && state.issue === undefined ? { status: "editing" } : state;
    case "resolve_oldest_pending":
      return state.status === "reconciling" && state.issue?.kind === "storage_conflict"
        ? { status: "reconciling", pending_request_id: state.pending_request_id, ...(state.submission_id === undefined ? {} : { submission_id: state.submission_id }) }
        : state;
    case "discard_rejected_request":
      return state.status === "reconciling"
          && (state.issue?.kind === "server_rejection" || state.issue?.kind === "idempotency_conflict")
        ? { status: "editing" }
        : state;
    case "retry_requested":
      return state.status === "transport_failure"
        ? { status: "submitting", pending_request_id: event.pending_request_id }
        : state;
    case "edit_requested":
      return state.status === "transport_failure" ? { status: "editing" } : state;
  }
}
