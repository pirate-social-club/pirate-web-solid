/** @jsxImportSource @solidjs/web */
import { For, Show } from "solid-js";
import { CommunityCommentCard } from "./community-comment-card.tsx";
import { childComments, type CommunityComment } from "./community-thread-model.ts";

export interface CommunityCommentTreeProps {
  readonly comments: readonly CommunityComment[];
  readonly parentId?: string | null;
  readonly onReply?: (commentId: string) => void;
  readonly onVote?: (commentId: string, direction: "up" | "down") => void;
}

export function CommunityCommentTree(props: CommunityCommentTreeProps) {
  const comments = () => childComments(props.comments, props.parentId ?? null);

  return (
    <Show when={comments().length > 0}>
      <ul class="divide-y divide-border-soft">
        <For each={comments()}>
          {(comment) => (
            <li>
              <CommunityCommentCard comment={comment} onReply={props.onReply} onVote={props.onVote} />
              <Show when={childComments(props.comments, comment.id).length > 0}>
                <div class="ml-4 border-l border-border-soft pl-4 md:ml-6 md:pl-5">
                  <CommunityCommentTree
                    comments={props.comments}
                    onReply={props.onReply}
                    onVote={props.onVote}
                    parentId={comment.id}
                  />
                </div>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}
