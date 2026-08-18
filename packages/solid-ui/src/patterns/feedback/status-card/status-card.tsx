import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { Type } from "@/components/data-display/type/type";
import { cn } from "@/lib/cn";

export interface StatusCardProps {
  title: string;
  description: string;
  actions?: JSX.Element;
  class?: string;
  flatOnMobile?: boolean;
  tone?: "default" | "success" | "warning";
}

/**
 * Inline status summary with an optional tone and action row. flatOnMobile
 * drops the card chrome on small viewports and restores it at md.
 */
export function StatusCard(props: StatusCardProps) {
  const tone = () => props.tone ?? "default";
  const toneClassName = () =>
    tone() === "success"
      ? "border-success/20 bg-success/5"
      : tone() === "warning"
        ? "border-warning/20 bg-warning/5"
        : "border-border-soft bg-card";
  const desktopToneClassName = () =>
    tone() === "success"
      ? "md:bg-success/5"
      : tone() === "warning"
        ? "md:bg-warning/5"
        : "md:bg-card";

  return (
    <div
      class={cn(
        "rounded-[var(--radius-3xl)] border p-5",
        toneClassName(),
        props.flatOnMobile &&
          `-mx-3 rounded-none border-x-0 bg-transparent px-3 shadow-none md:mx-0 md:rounded-[var(--radius-3xl)] md:border-x md:px-5 ${desktopToneClassName()}`,
        props.class,
      )}
    >
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div class="space-y-1.5">
          <Type as="p" variant="body-strong">{props.title}</Type>
          <Type as="p" variant="body" class="max-w-3xl text-muted-foreground">{props.description}</Type>
        </div>
        <Show when={props.actions}>
          <div class="flex shrink-0 flex-wrap gap-3">{props.actions}</div>
        </Show>
      </div>
    </div>
  );
}
