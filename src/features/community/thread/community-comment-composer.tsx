/** @jsxImportSource @solidjs/web */
import { Show } from "solid-js";

import { Button, Textarea, Type } from "../../../design-system";
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

  return (
    <section
      aria-label="Comment composer"
      class="rounded-2xl border border-border-soft bg-card p-4"
      data-community-comment-composer
    >
      <Show when={replyingTo()}>
        {(comment) => (
          <div class="mb-3 flex items-center justify-between gap-3">
            <Type variant="caption" class="min-w-0 truncate text-muted-foreground">
              Replying to {comment().authorHandle ?? comment().authorName}
            </Type>
            <Button
              class="shrink-0 cursor-pointer"
              onClick={props.onCancelReply}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel reply
            </Button>
          </div>
        )}
      </Show>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit();
        }}
      >
        <Show keyed when={replyingTo()} fallback={
          <Textarea
            aria-label="Write a comment"
            class="min-h-28"
            disabled={props.disabled || props.busy}
            id="community-thread-comment-composer"
            onInput={(event) => props.onChange(event.currentTarget.value)}
            placeholder="Add a comment..."
            value={props.value}
          />
        }>
          <Textarea
            aria-label="Write a reply"
            class="min-h-28"
            disabled={props.disabled || props.busy}
            id="community-thread-comment-composer"
            onInput={(event) => props.onChange(event.currentTarget.value)}
            placeholder="Write a reply"
            value={props.value}
          />
        </Show>
        <Show when={props.error}>
          {(error) => <Type as="p" variant="caption" class="mt-2 text-destructive-text" role="alert">{error()}</Type>}
        </Show>
        <div class="mt-3 flex items-center justify-between gap-3">
          <Button
            class="cursor-pointer"
            disabled={props.disabled || props.busy || props.value.trim().length === 0}
            type="submit"
          >
            {props.busy ? "Posting…" : "Post"}
          </Button>
        </div>
      </form>
    </section>
  );
}
