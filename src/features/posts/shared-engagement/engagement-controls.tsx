import { Show } from "solid-js";
import { type JSX } from "@solidjs/web";
import { CommentPill, IconArrowUp, IconChatCircle, VotePill } from "../../../design-system.ts";

export interface EngagementControlsProps {
  readonly score: number;
  readonly commentCount?: number;
  readonly viewerVote?: "up" | "down" | null;
  readonly busy?: boolean;
  readonly onVote?: (value: "up" | "down" | null) => void | Promise<void>;
  readonly onComment?: () => void;
  readonly children?: JSX.Element;
}

/** Vote state and requests remain in the caller's controller. */
export function EngagementControls(props: EngagementControlsProps) {
  return <div class="flex flex-wrap items-center gap-3">
    <Show when={props.onVote} fallback={<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" data-post-counts>
      <span class="inline-flex h-9 items-center gap-1 rounded-full border border-border-soft px-3"><IconArrowUp class="size-4" aria-hidden="true" /><span>{props.score}</span><span class="sr-only">points</span></span>
      <Show when={props.commentCount !== undefined}><span class="inline-flex h-9 items-center gap-2 rounded-full border border-border-soft px-3"><IconChatCircle class="size-4" aria-hidden="true" /><span>{props.commentCount}</span><span class="sr-only">comments</span></span></Show>
    </div>}><VotePill allowClear busy={props.busy} onVote={props.onVote} score={props.score} viewerVote={props.viewerVote} /></Show>
    <Show when={props.onComment}><CommentPill count={props.commentCount ?? 0} onComment={props.onComment} /></Show>
    {props.children}
  </div>;
}
