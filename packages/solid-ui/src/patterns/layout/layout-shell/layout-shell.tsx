import type { JSX } from "@solidjs/web";
import { createMemo, omit, type ParentProps } from "solid-js";

import { cn } from "@/lib/cn";

export function CardShell(
  props: ParentProps<JSX.HTMLAttributes<HTMLDivElement> & { class?: string }>,
) {
  const className = createMemo(() =>
    cn("rounded-[var(--radius-3xl)] border border-border-soft bg-card", props.class),
  );
  const rest = omit(props, "class", "children");

  return (
    <div class={className()} {...rest}>
      {props.children}
    </div>
  );
}

const pageSizeClasses = {
  default: "max-w-5xl",
  feed: "max-w-[46rem]",
  narrow: "max-w-4xl",
  rail: "max-w-[65.5rem]",
  wide: "max-w-7xl",
} as const;

export interface PageContainerProps
  extends JSX.HTMLAttributes<HTMLDivElement> {
  class?: string;
  size?: keyof typeof pageSizeClasses;
  gutter?: boolean;
}

export function PageContainer(props: ParentProps<PageContainerProps>) {
  const className = createMemo(() =>
    cn(
      "mx-auto w-full",
      pageSizeClasses[props.size ?? "default"],
      props.gutter &&
        "px-[var(--page-gutter-x)] md:px-[var(--page-gutter-x-md)] lg:px-[var(--page-gutter-x-lg)]",
      props.class,
    ),
  );
  const rest = omit(props, "class", "size", "gutter", "children");

  return (
    <div class={className()} {...rest}>
      {props.children}
    </div>
  );
}
