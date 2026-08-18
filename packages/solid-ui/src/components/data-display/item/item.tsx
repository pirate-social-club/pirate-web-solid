import type { JSX } from "@solidjs/web";
import { createMemo, omit, type ParentProps } from "solid-js";

import { Type } from "@/components/data-display/type/type";
import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "@/lib/recipe";

export const itemVariants = cva(
  "flex flex-wrap items-center rounded-lg border border-transparent text-foreground outline-0 transition-colors duration-150 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border-border-soft",
        muted: "bg-muted",
      },
      size: {
        default: "gap-3 p-4",
        sm: "gap-2.5 p-3",
        dense: "gap-3 px-3 py-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ItemProps
  extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "class">,
    VariantProps<typeof itemVariants> {
  class?: string;
}

export function Item(props: ParentProps<ItemProps>) {
  const className = createMemo(() =>
    cn(itemVariants({ variant: props.variant, size: props.size }), props.class),
  );
  const rest = omit(props, "class", "variant", "size", "children");

  return (
    <div class={className()} {...rest}>
      {props.children}
    </div>
  );
}

const itemMediaVariants = cva("flex shrink-0 items-center justify-center gap-2", {
  variants: {
    variant: {
      default: "",
      icon: "size-12 rounded-lg border border-border-soft bg-surface-skeleton",
      image: "size-12 overflow-hidden rounded bg-surface-skeleton",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface ItemMediaProps
  extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "class">,
    VariantProps<typeof itemMediaVariants> {
  class?: string;
}

export function ItemMedia(props: ParentProps<ItemMediaProps>) {
  const className = createMemo(() =>
    cn(itemMediaVariants({ variant: props.variant }), props.class),
  );
  const rest = omit(props, "class", "variant", "children");

  return (
    <div class={className()} {...rest}>
      {props.children}
    </div>
  );
}

export interface ItemGroupProps
  extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "class"> {
  class?: string;
}

export function ItemGroup(props: ParentProps<ItemGroupProps>) {
  const className = createMemo(() => cn("flex flex-col gap-2", props.class));
  const rest = omit(props, "class", "children");

  return (
    <div class={className()} {...rest}>
      {props.children}
    </div>
  );
}

export interface ItemContentProps
  extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "class"> {
  class?: string;
}

export function ItemContent(props: ParentProps<ItemContentProps>) {
  const className = createMemo(() =>
    cn("flex min-w-0 flex-1 flex-col gap-1", props.class),
  );
  const rest = omit(props, "class", "children");

  return (
    <div class={className()} {...rest}>
      {props.children}
    </div>
  );
}

export interface ItemTitleProps
  extends Omit<JSX.HTMLAttributes<HTMLElement>, "class"> {
  class?: string;
}

export function ItemTitle(props: ParentProps<ItemTitleProps>) {
  const className = createMemo(() =>
    cn("flex w-fit items-center gap-2", props.class),
  );
  const rest = omit(props, "class", "children");

  return (
    <Type as="div" class={className()} variant="label" {...rest}>
      {props.children}
    </Type>
  );
}

export interface ItemDescriptionProps
  extends Omit<JSX.HTMLAttributes<HTMLElement>, "class"> {
  class?: string;
}

export function ItemDescription(props: ParentProps<ItemDescriptionProps>) {
  const className = createMemo(() =>
    cn("m-0 line-clamp-2", props.class),
  );
  const rest = omit(props, "class", "children");

  return (
    <Type as="p" class={className()} variant="caption" {...rest}>
      {props.children}
    </Type>
  );
}

export interface ItemActionsProps
  extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "class"> {
  class?: string;
}

export function ItemActions(props: ParentProps<ItemActionsProps>) {
  const className = createMemo(() => cn("flex items-center gap-2", props.class));
  const rest = omit(props, "class", "children");

  return (
    <div class={className()} {...rest}>
      {props.children}
    </div>
  );
}
