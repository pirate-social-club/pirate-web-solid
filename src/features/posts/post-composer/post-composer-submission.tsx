/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { Button } from "../../../design-system";
import type { PostComposerState } from "./post-composer-state";

export interface PostComposerSubmissionProps {
  readonly onRetry?: () => void;
  readonly state: PostComposerState;
}

function stateMessage(state: PostComposerState): string {
  switch (state.status) {
    case "editing":
      return "Ready to submit your post.";
    case "submitting":
      return "Submitting your post…";
    case "reconciling":
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
      }
  }
}

export function PostComposerSubmission(props: PostComposerSubmissionProps): JSX.Element {
  const isSubmitting = () => props.state.status === "submitting";
  const isReconciling = () => props.state.status === "reconciling";
  const isRetryableFailure = () => props.state.status === "transport_failure";

  return (
    <div
      aria-busy={isSubmitting() ? "true" : "false"}
      aria-live="polite"
      class="grid gap-3 rounded-2xl border border-border-soft bg-card p-5 text-base"
      data-post-composer-state={props.state.status}
      role={isRetryableFailure() || props.state.status === "blocked" ? "alert" : "status"}
    >
      <p>{stateMessage(props.state)}</p>
      <Show when={isRetryableFailure() && props.onRetry}>
        <Button type="button" variant="outline" onClick={() => props.onRetry?.()}>Try again</Button>
      </Show>
      <Show when={isReconciling() && props.onRetry}>
        <Button type="button" variant="outline" onClick={() => props.onRetry?.()}>Check again</Button>
      </Show>
    </div>
  );
}
