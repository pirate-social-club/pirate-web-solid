/** @jsxImportSource @solidjs/web */
import { Show } from "solid-js";

import { Button, FormattedTextarea, Type } from "../../../design-system";
import type { CommunityComment } from "./community-thread-model.ts";

export interface CommunityCommentComposerProps {
  readonly replyTo?: CommunityComment | null;
  readonly value: string;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly onCancelReply?: () => void;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
}

export function CommunityCommentComposer(props: CommunityCommentComposerProps) {
  const replyingTo = () => props.replyTo ?? null;
  const actionLabel = () => replyingTo() ? "Post reply" : "Post comment";

  return (
    <section
      aria-labelledby="community-comment-composer-heading"
      class="rounded-2xl border border-border-soft bg-card p-4"
      data-community-comment-composer
    >
      <div class="mb-3 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <Type as="h3" variant="h4" id="community-comment-composer-heading">
            {replyingTo() ? "Reply to this comment" : "Join the conversation"}
          </Type>
          <Show when={replyingTo()}>
            {(comment) => (
              <Type variant="caption" class="mt-1 block truncate text-muted-foreground">
                Replying to {comment().authorHandle ?? comment().authorName}
              </Type>
            )}
          </Show>
        </div>
        <Show when={replyingTo()}>
          <Button
            class="shrink-0 cursor-pointer"
            onClick={props.onCancelReply}
            size="sm"
            type="button"
            variant="ghost"
          >
            Cancel reply
          </Button>
        </Show>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit();
        }}
      >
        <Show keyed when={replyingTo()} fallback={
          <FormattedTextarea
            aria-label="Write a comment"
            disabled={props.disabled || props.busy}
            id="community-thread-comment-composer"
            onChange={props.onChange}
            placeholder="Add a comment..."
            value={props.value}
          />
        }>
          <FormattedTextarea
            aria-label="Write a reply"
            disabled={props.disabled || props.busy}
            id="community-thread-comment-composer"
            onChange={props.onChange}
            placeholder="Write a reply"
            value={props.value}
          />
        </Show>
        <Show when={props.error}>
          {(error) => <Type as="p" variant="caption" class="mt-2 text-destructive-text" role="alert">{error()}</Type>}
        </Show>
        <div class="mt-3 flex items-center justify-between gap-3">
          <Type variant="caption" class="text-muted-foreground">Markdown formatting is supported.</Type>
          <Button
            class="cursor-pointer"
            disabled={props.disabled || props.busy || props.value.trim().length === 0}
            type="submit"
          >
            {props.busy ? "Posting…" : actionLabel()}
          </Button>
        </div>
      </form>
    </section>
  );
}
