/** @jsxImportSource @solidjs/web */
import { createSignal, Show } from "solid-js";

import { Card, CardContent, IconCaretLeft, Type } from "@pirate/web-solid-ui";
import { CommunityCommentTree } from "./community-comment-tree.tsx";
import { CommunityCommentComposer } from "./community-comment-composer.tsx";
import type { CommunityComment, CommunityThread } from "./community-thread-model.ts";
import { CommunityPostCard } from "../page-shell/community-post-card.tsx";

export interface CommunityThreadViewProps {
  readonly thread: CommunityThread;
  readonly onReply?: (commentId: string) => void;
  readonly onSubmitComment?: (body: string, parentId: string | null) => void | Promise<void>;
  readonly allowLocalCommentSubmit?: boolean;
  readonly onVote?: (commentId: string, direction: "up" | "down") => void;
  readonly onPostVote?: (postId: string, direction: "up" | "down") => void;
}

export function CommunityThreadView(props: CommunityThreadViewProps) {
  const [comments, setComments] = createSignal<CommunityComment[]>([...props.thread.comments]);
  const [replyTo, setReplyTo] = createSignal<CommunityComment | null>(null);
  const [draft, setDraft] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");

  const beginReply = (commentId: string) => {
    const comment = comments().find(item => item.id === commentId);
    if (!comment) return;
    setReplyTo(comment);
    setError("");
    requestAnimationFrame(() => {
      const composer = document.getElementById("community-thread-comment-composer");
      composer?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (composer instanceof HTMLTextAreaElement) composer.focus();
    });
    props.onReply?.(commentId);
  };

  const cancelReply = () => {
    setReplyTo(null);
    setError("");
  };

  const submitComment = async () => {
    const body = draft().trim();
    if (body.length === 0 || busy()) return;
    setBusy(true);
    setError("");
    const parentId = replyTo()?.id ?? null;
    try {
      if (props.onSubmitComment) {
        await props.onSubmitComment(body, parentId);
      } else if (!props.allowLocalCommentSubmit) {
        throw new Error(parentId === null
          ? "Top-level comment publishing is not connected yet."
          : "Reply publishing is not connected yet.");
      }
      if (props.allowLocalCommentSubmit) {
        setComments(previous => [...previous, {
          id: `review-comment-${Date.now()}`,
          parentId,
          authorName: "You",
          authorHandle: "you",
          body,
          publishedLabel: "now",
          score: 0,
          viewerVote: null,
        }]);
      }
      setDraft("");
      setReplyTo(null);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "This comment could not be posted yet.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="mx-auto w-full max-w-3xl px-4 py-6 md:px-6" data-community-thread-page aria-label="Thread">
      <Show when={props.thread.communityHref}>
        {(href) => (
          <a class="mb-5 inline-flex cursor-pointer items-center text-sm text-muted-foreground hover:text-foreground" href={href()}>
            <IconCaretLeft aria-hidden="true" class="mr-2 size-4" /> Back to {props.thread.communityName ?? "community"}
          </a>
        )}
      </Show>

      <Card>
        <CardContent class="p-0">
          <CommunityPostCard onVote={props.onPostVote} post={props.thread.post} titleHref={null} />
        </CardContent>
      </Card>

      <section class="mt-6" aria-label="Comments">
        <div class="mt-4">
          <CommunityCommentComposer
            busy={busy()}
            disabled={props.thread.commentsStatus !== "ready"}
            error={error()}
            onCancelReply={cancelReply}
            onChange={setDraft}
            onSubmit={() => { void submitComment(); }}
            replyTo={replyTo()}
            value={draft()}
          />
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
              <CommunityCommentTree comments={comments()} onReply={beginReply} onVote={props.onVote} />
            </div>
          </Show>
        </Show>
      </section>
    </main>
  );
}
