/** @jsxImportSource @solidjs/web */
import { Show } from "solid-js";

import { Avatar, CommentPill, SharePill, Type, VotePill } from "@pirate/web-solid-ui";
import type { CommunityPost } from "./page-shell-model";

export interface CommunityPostCardProps {
  post: CommunityPost;
  titleHref?: string | null;
  onOpen?: (postId: string) => void;
  onShare?: (postId: string) => void;
  onVote?: (postId: string, direction: "up" | "down") => void;
}

function postDate(post: CommunityPost): string {
  return post.publishedLabel ?? post.publishedAt.slice(0, 10);
}

function profileHref(handle: string): string {
  return `/u/${handle.trim().replace(/^u\//i, "").replace(/^@/, "")}`;
}

export function CommunityPostCard(props: CommunityPostCardProps) {
  const authorName = () => props.post.authorName ?? "Community member";
  const authorHandle = () => props.post.authorHandle ?? authorName();
  const titleHref = () => props.titleHref === null ? null : props.titleHref ?? props.post.postHref ?? `/p/${props.post.id}`;
  const handleVote = (direction: "up" | "down" | null) => {
    if (direction !== null) props.onVote?.(props.post.id, direction);
  };

  return (
    <article
      class="border-b border-border-soft px-4 py-4 transition-colors hover:bg-muted/10 md:px-5"
      data-community-post-id={props.post.id}
    >
      <header class="flex items-center gap-3">
        <a aria-label={`Open ${authorHandle()}'s profile`} class="cursor-pointer rounded-full" href={profileHref(authorHandle())}>
          <Avatar
            fallback={authorName()}
            size="sm"
            src={props.post.authorAvatarSrc}
          />
        </a>
        <div class="min-w-0 flex-1">
          <Type as="div" variant="label" class="truncate">
            <a class="cursor-pointer hover:underline" href={profileHref(authorHandle())}>{authorHandle()}</a>
            <Type as="span" variant="caption" class="ml-2">· {postDate(props.post)}</Type>
          </Type>
        </div>
        <button
          aria-label={`More options for ${props.post.title}`}
          class="cursor-pointer rounded-full px-2 py-1 text-lg leading-none text-muted-foreground hover:bg-muted"
          onClick={() => undefined}
          type="button"
        >
          …
        </button>
      </header>

      <Show
        when={titleHref()}
        fallback={<Type as="h3" variant="h3" class="mt-3 leading-7">{props.post.title}</Type>}
      >
        {(href) => (
          <a
            class="mt-3 block w-full cursor-pointer text-left hover:underline"
            href={href()}
            onClick={() => props.onOpen?.(props.post.id)}
          >
            <Type as="h3" variant="h3" class="leading-7">{props.post.title}</Type>
          </a>
        )}
      </Show>

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
        <VotePill
          allowClear
          onVote={props.onVote ? handleVote : undefined}
          score={props.post.score}
          viewerVote={props.post.viewerVote}
        />
        <CommentPill count={props.post.commentCount ?? 0} onComment={() => props.onOpen?.(props.post.id)} />
        <SharePill onShare={() => props.onShare?.(props.post.id)} />
      </footer>
    </article>
  );
}
