/** @jsxImportSource @solidjs/web */
import { Show } from "solid-js";

import { Card, CardContent, Type } from "@pirate/web-solid-ui";
import { CommunityCommentTree } from "./community-comment-tree.tsx";
import type { CommunityThread } from "./community-thread-model.ts";
import { CommunityPostCard } from "../page-shell/community-post-card.tsx";

export interface CommunityThreadViewProps {
  readonly thread: CommunityThread;
  readonly onReply?: (commentId: string) => void;
  readonly onVote?: (commentId: string, direction: "up" | "down") => void;
  readonly onPostVote?: (postId: string, direction: "up" | "down") => void;
}

export function CommunityThreadView(props: CommunityThreadViewProps) {
  const commentsLabel = () => `${props.thread.post.commentCount ?? props.thread.comments.length} comments`;

  return (
    <main class="mx-auto w-full max-w-3xl px-4 py-6 md:px-6" data-community-thread-page aria-label="Thread">
      <Show when={props.thread.communityHref}>
        {(href) => (
          <a class="mb-5 inline-flex cursor-pointer items-center text-sm text-muted-foreground hover:text-foreground" href={href()}>
            <span aria-hidden="true" class="mr-2">←</span> Back to {props.thread.communityName ?? "community"}
          </a>
        )}
      </Show>

      <Card>
        <CardContent class="p-0">
          <CommunityPostCard onVote={props.onPostVote} post={props.thread.post} titleHref={null} />
        </CardContent>
      </Card>

      <section class="mt-6" aria-labelledby="community-thread-comments-heading">
        <div class="flex items-baseline justify-between gap-4 border-b border-border-soft pb-3">
          <Type as="h2" variant="h2" id="community-thread-comments-heading">Comments</Type>
          <Type variant="caption">{commentsLabel()}</Type>
        </div>

        <Show when={props.thread.commentsStatus === "ready"} fallback={
          <Card class="mt-4">
            <CardContent>
              <Type variant="body" class="text-muted-foreground">
                {props.thread.commentsStatus === "locked"
                  ? "Comments are locked for this thread."
                  : "Comments are not available yet."}
              </Type>
            </CardContent>
          </Card>
        }>
          <Show when={props.thread.comments.length > 0} fallback={
            <Card class="mt-4">
              <CardContent>
                <Type variant="body" class="text-muted-foreground">No comments yet.</Type>
              </CardContent>
            </Card>
          }>
            <div class="mt-1">
              <CommunityCommentTree comments={props.thread.comments} onReply={props.onReply} onVote={props.onVote} />
            </div>
          </Show>
        </Show>
      </section>
    </main>
  );
}
