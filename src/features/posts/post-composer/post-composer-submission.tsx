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
    case "published":
      return "Post published.";
    case "manual_review":
      return "This post is awaiting review.";
    case "blocked":
      return "This post was blocked by community policy.";
    case "failure":
      return state.message;
  }
}

export function PostComposerSubmission(props: PostComposerSubmissionProps): JSX.Element {
  const isFailure = () => props.state.status === "failure";
  const isSubmitting = () => props.state.status === "submitting";

  return (
    <div
      aria-busy={isSubmitting() ? "true" : "false"}
      aria-live="polite"
      class="grid gap-3 rounded-2xl border border-border-soft bg-card p-5 text-base"
      data-post-composer-state={props.state.status}
      role={isFailure() || props.state.status === "blocked" ? "alert" : "status"}
    >
      <p>{stateMessage(props.state)}</p>
      <Show when={isFailure() && props.onRetry}>
        <Button type="button" variant="outline" onClick={() => props.onRetry?.()}>Try again</Button>
      </Show>
    </div>
  );
}
