/** @jsxImportSource @solidjs/web */
import { Show } from "solid-js";

import { Avatar, Type } from "@pirate/web-solid-ui";
import type { CommunityPost } from "./page-shell-model";

export interface CommunityPostCardProps {
  post: CommunityPost;
  onOpen?: (postId: string) => void;
  onShare?: (postId: string) => void;
  onVote?: (postId: string, direction: "up" | "down") => void;
}

function postDate(post: CommunityPost): string {
  return post.publishedLabel ?? post.publishedAt.slice(0, 10);
}

export function CommunityPostCard(props: CommunityPostCardProps) {
  const authorName = () => props.post.authorName ?? "Community member";
  const authorHandle = () => props.post.authorHandle ?? authorName();

  return (
    <article
      class="border-b border-border-soft px-4 py-4 transition-colors hover:bg-muted/10 md:px-5"
      data-community-post-id={props.post.id}
    >
      <header class="flex items-center gap-3">
        <Avatar
          fallback={authorName()}
          size="sm"
          src={props.post.authorAvatarSrc}
        />
        <div class="min-w-0 flex-1">
          <Type as="div" variant="label" class="truncate">
            {authorHandle()}
            <Type as="span" variant="caption" class="ml-2">· {postDate(props.post)}</Type>
          </Type>
        </div>
        <button
          aria-label={`More options for ${props.post.title}`}
          class="rounded-full px-2 py-1 text-lg leading-none text-muted-foreground hover:bg-muted"
          onClick={() => undefined}
          type="button"
        >
          …
        </button>
      </header>

      <button
        class="mt-3 block w-full text-left"
        onClick={() => props.onOpen?.(props.post.id)}
        type="button"
      >
        <Type as="h3" variant="h3" class="leading-7">{props.post.title}</Type>
      </button>

      <Show when={props.post.body}>
        <Type as="p" variant="body" class="mt-2 whitespace-pre-line">{props.post.body}</Type>
      </Show>

      <Show when={props.post.mediaSrc}>
        {(mediaSrc) => (
          <img
            alt={props.post.mediaAlt ?? ""}
            class="mx-auto mt-3 max-h-[34rem] w-full rounded-xl object-cover md:max-w-[38rem]"
            loading="lazy"
            src={mediaSrc()}
          />
        )}
      </Show>

      <footer class="mt-4 flex flex-wrap items-center gap-2" aria-label="Post activity">
        <button
          aria-label={`Upvote ${props.post.title}`}
          class="rounded-full border border-border-soft px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          onClick={() => props.onVote?.(props.post.id, "up")}
          type="button"
        >
          ↑ {props.post.score}
        </button>
        <button
          aria-label={`Comment on ${props.post.title}`}
          class="rounded-full border border-border-soft px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          onClick={() => props.onOpen?.(props.post.id)}
          type="button"
        >
          ◌ {props.post.commentCount ?? 0}
        </button>
        <button
          aria-label={`Share ${props.post.title}`}
          class="rounded-full border border-border-soft px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          onClick={() => props.onShare?.(props.post.id)}
          type="button"
        >
          Share
        </button>
      </footer>
    </article>
  );
}
