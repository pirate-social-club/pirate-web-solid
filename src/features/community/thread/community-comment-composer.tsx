/** @jsxImportSource @solidjs/web */
import { createEffect, createSignal, Show } from "solid-js";

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
  const [expanded, setExpanded] = createSignal(false);
  const replyingTo = () => props.replyTo ?? null;

  createEffect(
    () => props.replyTo,
    reply => {
      if (reply !== null && reply !== undefined) setExpanded(true);
    },
  );

  const cancelReply = () => {
    setExpanded(false);
    props.onCancelReply?.();
  };

  return (
    <section
      aria-label="Comment composer"
      data-community-comment-composer
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit();
        }}
      >
        <Show when={expanded() && replyingTo()}>
        {(comment) => (
          <div class="mb-3 flex items-center justify-between gap-3">
            <Type variant="caption" class="min-w-0 truncate text-muted-foreground">
              Replying to {comment().authorHandle ?? comment().authorName}
            </Type>
            <Button
              class="shrink-0 cursor-pointer"
              onClick={cancelReply}
              size="sm"
              type="button"
              variant="ghost"
            >
              Cancel reply
            </Button>
          </div>
        )}
      </Show>
        <Show keyed when={replyingTo()} fallback={
          <Textarea
            aria-label="Write a comment"
            class={expanded() ? "min-h-28 bg-transparent shadow-none" : "h-11 min-h-0 bg-transparent py-2.5 shadow-none"}
            disabled={props.disabled || props.busy}
            id="community-thread-comment-composer"
            onClick={() => setExpanded(true)}
            onFocus={() => setExpanded(true)}
            onInput={(event) => props.onChange(event.currentTarget.value)}
            placeholder="Add a comment..."
            value={props.value}
          />
        }>
          <Textarea
            aria-label="Write a reply"
            class={expanded() ? "min-h-28 bg-transparent shadow-none" : "h-11 min-h-0 bg-transparent py-2.5 shadow-none"}
            disabled={props.disabled || props.busy}
            id="community-thread-comment-composer"
            onClick={() => setExpanded(true)}
            onFocus={() => setExpanded(true)}
            onInput={(event) => props.onChange(event.currentTarget.value)}
            placeholder="Write a reply"
            value={props.value}
          />
        </Show>
        <Show when={expanded()}>
          <Show when={props.error}>
            {(error) => <Type as="p" variant="caption" class="mt-2 text-destructive-text" role="alert">{error()}</Type>}
          </Show>
          <div class="mt-3 flex justify-end">
            <Button
              class="cursor-pointer"
              disabled={props.disabled || props.busy || props.value.trim().length === 0}
              type="submit"
            >
              {props.busy ? "Posting…" : "Post"}
            </Button>
          </div>
        </Show>
      </form>
    </section>
  );
}
