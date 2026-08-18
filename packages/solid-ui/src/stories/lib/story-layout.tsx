import type { ParentProps } from "solid-js";

import { cn } from "@/lib/cn";

/** Horizontal row of story variants for side-by-side comparison. */
export function StoryRow(props: ParentProps<{ class?: string }>) {
  return (
    <div class={cn("flex flex-wrap items-center gap-3", props.class)}>
      {props.children}
    </div>
  );
}

/** Vertical stack of story states. */
export function StoryStack(props: ParentProps<{ class?: string }>) {
  return (
    <div class={cn("flex flex-col gap-3", props.class)}>{props.children}</div>
  );
}
