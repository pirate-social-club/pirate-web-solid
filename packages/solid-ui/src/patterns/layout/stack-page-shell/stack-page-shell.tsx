import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { Type } from "@/components/data-display/type/type";
import { CardShell } from "@/patterns/layout/layout-shell/layout-shell";
import { cn } from "@/lib/cn";

export interface StackPageShellProps {
  title: string;
  actions?: JSX.Element;
  children?: JSX.Element;
  description?: string;
  headerVariant?: "card" | "plain";
  hideTitleOnMobile?: boolean;
}

/**
 * Stacked page scaffold: a header (card or plain) with title, description,
 * and actions, followed by page content. Pure layout; no routing or data
 * dependencies.
 */
export function StackPageShell(props: StackPageShellProps) {
  const showHeader = () =>
    Boolean(props.title.trim() || props.description || props.actions);
  const headerRowClassName = cn(
    "flex flex-col gap-4 md:flex-row md:justify-between",
    props.description ? "md:items-end" : "md:items-center",
  );

  const header = (
    <div class={headerRowClassName}>
      <div class="flex flex-col gap-2">
        <Show when={props.title.trim()}>
          <Type
            as="h1"
            variant="h1"
            class={cn(
              "text-2xl md:text-3xl",
              props.hideTitleOnMobile && "hidden md:block",
            )}
          >
            {props.title}
          </Type>
        </Show>
        <Show when={props.description}>
          <Type as="p" variant="body" class="max-w-3xl text-muted-foreground">
            {props.description}
          </Type>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class="flex shrink-0 flex-wrap gap-3">{props.actions}</div>
      </Show>
    </div>
  );

  return (
    <section class="flex min-w-0 flex-1 flex-col gap-6">
      <Show when={showHeader()}>
        <Show
          when={(props.headerVariant ?? "card") === "plain"}
          fallback={<CardShell class="p-5 md:p-6">{header}</CardShell>}
        >
          <div class="px-1 md:px-6">{header}</div>
        </Show>
      </Show>
      {props.children}
    </section>
  );
}
