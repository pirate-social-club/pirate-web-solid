/** @jsxImportSource @solidjs/web */
import { Avatar, Button, Type, VotePill } from "@pirate/web-solid-ui";
import type { CommunityComment } from "./community-thread-model.ts";

export interface CommunityCommentCardProps {
  readonly comment: CommunityComment;
  readonly onReply?: (commentId: string) => void;
  readonly onVote?: (commentId: string, direction: "up" | "down") => void;
}

function profileHref(handle: string): string {
  return `/u/${handle.trim().replace(/^u\//i, "").replace(/^@/, "")}`;
}

export function CommunityCommentCard(props: CommunityCommentCardProps) {
  const handleVote = (direction: "up" | "down" | null) => {
    if (direction !== null) props.onVote?.(props.comment.id, direction);
  };

  return (
    <article class="py-4" data-community-comment-id={props.comment.id}>
      <header class="flex items-center gap-3">
        <a
          aria-label={`Open ${props.comment.authorHandle ?? props.comment.authorName}'s profile`}
          class="cursor-pointer rounded-full"
          href={props.comment.authorHandle ? profileHref(props.comment.authorHandle) : undefined}
        >
          <Avatar fallback={props.comment.authorName} size="sm" src={props.comment.authorAvatarSrc} />
        </a>
        <Type as="div" variant="label" class="min-w-0 truncate">
          {props.comment.authorHandle ? (
            <a class="cursor-pointer hover:underline" href={profileHref(props.comment.authorHandle)}>
              {props.comment.authorHandle}
            </a>
          ) : props.comment.authorName}
          <Type as="span" variant="caption" class="ml-2">· {props.comment.publishedLabel}</Type>
        </Type>
      </header>

      <Type as="p" variant="body" class="mt-3 whitespace-pre-line">{props.comment.body}</Type>

      <footer class="mt-3 flex flex-wrap items-center gap-2" aria-label="Comment activity">
        <VotePill
          allowClear
          onVote={props.onVote ? handleVote : undefined}
          score={props.comment.score}
          size="compact"
          viewerVote={props.comment.viewerVote}
        />
        <Button
          class="cursor-pointer"
          onClick={() => props.onReply?.(props.comment.id)}
          size="sm"
          variant="ghost"
        >
          Reply
        </Button>
      </footer>
    </article>
  );
}
