import { createMemo } from "solid-js";

import { IconShareFat } from "@/components/media/icons";
import { cn } from "@/lib/cn";

export interface SharePillProps {
  label?: string;
  onShare?: () => void;
  class?: string;
}

export function SharePill(props: SharePillProps) {
  const className = createMemo(() =>
    cn(
      "inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-border-soft bg-background px-4 text-base text-muted-foreground transition-colors hover:border-border hover:bg-muted/60 hover:text-foreground",
      props.class,
    ),
  );

  return (
    <button
      aria-label={props.label ?? "Share"}
      class={className()}
      onClick={props.onShare}
      type="button"
    >
      <IconShareFat class="size-[23px]" />
      <span class="font-medium">{props.label ?? "Share"}</span>
    </button>
  );
}
