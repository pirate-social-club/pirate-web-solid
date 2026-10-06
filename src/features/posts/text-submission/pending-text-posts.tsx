/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import { Button, CommunityAvatar, Type } from "../../../design-system";
import type { TextSubmissionRejection } from "./text-submission-machine";
import type { TextSubmissionItem } from "./text-submission-store";

export interface PendingTextPostsProps {
  readonly items: readonly TextSubmissionItem[];
  readonly onRetry: (id: string) => void;
  /** Take the text back into the composer and forget this attempt. */
  readonly onEdit: (item: TextSubmissionItem) => void;
  readonly onDismiss: (id: string) => void;
}

function rejectionMessage(rejection: TextSubmissionRejection | null): string {
  switch (rejection) {
    case "not_allowed": return "You can't post in this community right now.";
    case "held": return "This post is waiting for review before it appears.";
    case "blocked": return "This post isn't allowed in this community.";
    default: return "This post couldn't be published. Edit it and try again.";
  }
}

/**
 * The author's own posts that the server has not yet answered for, shown at
 * the top of the feed where the post will be. A post being sent looks like a
 * post; it says something only once it has been waiting long enough that
 * silence would mislead, and that message never calls the post failed.
 */
export function PendingTextPosts(props: PendingTextPostsProps): JSX.Element {
  return (
    <For each={props.items}>
      {item => {
        const current = () => item;
        const author = () => current().authorHandle ?? "You";
        return (
          <article
            aria-busy={current().status === "sending" || current().status === "delayed" ? "true" : "false"}
            class="relative flex flex-col gap-3 border-b border-border-soft px-0 py-5 first:pt-0"
            data-pending-text-post={current().id}
            data-pending-text-post-status={current().status}
          >
            <div class="flex items-center gap-2">
              <CommunityAvatar avatarSrc={current().authorAvatarSrc} communityId={current().personaId} displayName={author()} size="xs" />
              <Type as="span" variant="label">{author()}</Type>
              <Show when={current().status === "sending"}>
                <Type as="span" variant="caption">· Posting…</Type>
              </Show>
              <Show when={current().status === "published"}>
                <Type as="span" variant="caption">· now</Type>
              </Show>
            </div>
            <div class={current().status === "published" ? undefined : "opacity-70"}>
              <Show when={current().title.trim() !== ""}>
                <Type variant="h3">
                  <Show when={current().status === "published" ? current().postHref : null} fallback={current().title}>
                    {href => <a class="hover:underline" href={href()}>{current().title}</a>}
                  </Show>
                </Type>
              </Show>
              <Type variant="body">{current().body}</Type>
            </div>
            <Show when={current().status === "delayed"}>
              <div class="flex flex-wrap items-center gap-2" role="status">
                <Type variant="caption">Not sent yet. Still trying.</Type>
                <Button onClick={() => props.onRetry(current().id)} size="sm" type="button" variant="outline">Try now</Button>
                <Button onClick={() => props.onEdit(current())} size="sm" type="button" variant="ghost">Stop and edit</Button>
              </div>
            </Show>
            <Show when={current().status === "rejected"}>
              <div class="flex flex-wrap items-center gap-2" role="alert">
                <Type variant="caption">{rejectionMessage(current().rejection)}</Type>
                <Show when={current().rejection !== "held"} fallback={
                  <Button onClick={() => props.onDismiss(current().id)} size="sm" type="button" variant="ghost">Dismiss</Button>
                }>
                  <Button onClick={() => props.onEdit(current())} size="sm" type="button" variant="outline">Edit</Button>
                  <Button onClick={() => props.onDismiss(current().id)} size="sm" type="button" variant="ghost">Discard</Button>
                </Show>
              </div>
            </Show>
          </article>
        );
      }}
    </For>
  );
}
