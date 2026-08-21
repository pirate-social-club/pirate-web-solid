/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { Button } from "../../../design-system";
import type { PostComposerState } from "./post-composer-state";

function hasReconciliationIssue(state: PostComposerState): boolean {
  return state.status === "reconciling" && state.issue !== undefined;
}

export interface PostComposerSubmissionProps {
  readonly onRetry?: () => void;
  readonly onNewDraft?: () => void;
  readonly onDiscardAndEdit?: () => void;
  readonly onResolveOldest?: () => void;
  readonly state: PostComposerState;
}

function stateMessage(state: PostComposerState): string {
  switch (state.status) {
    case "editing":
      return "Ready to submit your post.";
    case "submitting":
      return "Submitting your post…";
    case "reconciling":
      if (state.issue?.kind === "idempotency_conflict") {
        return `This saved request conflicts with an existing submission (${state.issue.submission_id}). Discard it to edit the original post.`;
      }
      if (state.issue?.kind === "server_rejection") {
        return `The server rejected this saved request (${state.issue.status}). You can discard it and edit the original post.`;
      }
      if (state.issue?.kind === "storage_conflict") {
        return "More than one saved request needs attention. Resolve the oldest request before submitting another.";
      }
      return "Checking whether your post was accepted…";
    case "published":
      return "Post published.";
    case "manual_review":
      return state.reason_code === "moderation_unavailable"
        ? "This post is awaiting review because moderation is temporarily unavailable."
        : "This post is awaiting review.";
    case "blocked":
      return "This post was blocked by community policy.";
    case "abandoned":
      return "This post was cancelled before publication.";
    case "transport_failure":
      switch (state.reason) {
        case "local_validation_failed": return "Check the post details and try again.";
        case "serialization_failed": return "The post could not be prepared safely. Try again.";
        case "durable_storage_failed": return "The post could not be saved for safe retry. Try again.";
      }
  }
}

export function PostComposerSubmission(props: PostComposerSubmissionProps): JSX.Element {
  const isSubmitting = () => props.state.status === "submitting";
  const isReconciling = () => props.state.status === "reconciling";
  const isRetryableFailure = () => props.state.status === "transport_failure";
  const isReplayBlocked = () => hasReconciliationIssue(props.state);
  const isDiscardableRejection = () => props.state.status === "reconciling"
    && (props.state.issue?.kind === "server_rejection" || props.state.issue?.kind === "idempotency_conflict");
  const isStorageConflict = () => props.state.status === "reconciling" && props.state.issue?.kind === "storage_conflict";

  return (
    <div
      aria-busy={isSubmitting() ? "true" : "false"}
      aria-live="polite"
      class="grid gap-3 rounded-2xl border border-border-soft bg-card p-5 text-base"
      data-post-composer-state={props.state.status}
      role={isRetryableFailure() || props.state.status === "blocked" || isReplayBlocked() ? "alert" : "status"}
    >
      <p>{stateMessage(props.state)}</p>
      <Show when={isRetryableFailure() && props.onRetry}>
        <Button type="button" variant="outline" onClick={() => props.onRetry?.()}>Try again</Button>
      </Show>
      <Show when={isReconciling() && !isReplayBlocked() && props.onRetry}>
        <Button type="button" variant="outline" onClick={() => props.onRetry?.()}>Check again</Button>
      </Show>
      <Show when={isReconciling() && !isReplayBlocked() && props.onNewDraft}>
        <Button type="button" variant="ghost" onClick={() => props.onNewDraft?.()}>Start a new draft</Button>
      </Show>
      <Show when={isDiscardableRejection() && props.onDiscardAndEdit}>
        <Button type="button" variant="outline" onClick={() => props.onDiscardAndEdit?.()}>Discard and edit</Button>
      </Show>
      <Show when={isStorageConflict() && props.onResolveOldest}>
        <Button type="button" variant="outline" onClick={() => props.onResolveOldest?.()}>Check oldest request</Button>
      </Show>
    </div>
  );
}
