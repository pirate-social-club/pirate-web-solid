import { createMemo } from "solid-js";

import { IconChatCircle } from "@/components/media/icons";
import { cn } from "@/lib/cn";

export interface CommentPillProps {
  count: number;
  onComment?: () => void;
  class?: string;
}

export function CommentPill(props: CommentPillProps) {
  const className = createMemo(() =>
    cn(
      "inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-border-soft bg-background px-4 text-base text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground",
      props.class,
    ),
  );

  return (
    <button
      aria-label={`Comments (${props.count})`}
      class={className()}
      onClick={props.onComment}
      type="button"
    >
      <IconChatCircle class="size-[23px]" />
      <span class="font-medium tabular-nums">{props.count}</span>
    </button>
  );
}
