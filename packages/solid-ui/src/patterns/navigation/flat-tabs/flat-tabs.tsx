import { createMemo, omit, type ParentProps } from "solid-js";
import type { JSX } from "@solidjs/web";

import { cn } from "@/lib/cn";

function columnsStyle(columns?: number): string | undefined {
  return columns
    ? `grid-template-columns: repeat(${columns}, minmax(0, 1fr))`
    : undefined;
}

export interface FlatTabBarProps {
  actions?: JSX.Element;
  class?: string;
  columns?: number;
}

export function FlatTabBar(props: ParentProps<FlatTabBarProps>) {
  const className = createMemo(() =>
    cn(
      "flex items-center justify-between gap-4 border-b border-border-soft",
      props.class,
    ),
  );

  return (
    <div class={className()}>
      <div
        class={cn(
          "min-w-0",
          props.columns
            ? "grid flex-1 gap-0 overflow-visible"
            : "flex items-center gap-4 overflow-x-auto",
        )}
        style={columnsStyle(props.columns)}
      >
        {props.children}
      </div>
      {props.actions ? <div class="shrink-0">{props.actions}</div> : null}
    </div>
  );
}

export interface FlatTabButtonProps {
  active?: boolean;
  class?: string;
  onClick?: () => void;
}

export function FlatTabButton(props: ParentProps<FlatTabButtonProps>) {
  const className = createMemo(() =>
    cn(
      "inline-flex h-12 min-w-0 cursor-pointer items-center justify-center border-b-2 px-1 text-base font-semibold transition-colors",
      props.active
        ? "border-primary text-foreground"
        : "border-transparent text-muted-foreground hover:text-foreground",
      props.class,
    ),
  );

  return (
    <button class={className()} onClick={() => props.onClick?.()} type="button">
      <span class="truncate">{props.children}</span>
    </button>
  );
}
