import type { JSX } from "@solidjs/web";
import { createMemo, omit, type ParentProps } from "solid-js";

import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "@/lib/recipe";

const chipVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-full text-base font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground hover:bg-muted/80",
        selected: "bg-primary-subtle text-primary-text",
        outline: "border border-border-soft bg-background text-muted-foreground hover:text-foreground",
        active: "border border-primary bg-primary/5 text-foreground",
      },
      size: {
        sm: "px-3 py-1",
        md: "px-3 py-1.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface ChipProps
  extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "ref" | "size">,
    VariantProps<typeof chipVariants> {
  leadingIcon?: JSX.Element;
}

export function Chip(props: ParentProps<ChipProps>) {
  const className = createMemo(() =>
    cn(chipVariants({ variant: props.variant, size: props.size }), props.class),
  );
  const rest = omit(props, "class", "variant", "size", "leadingIcon", "children", "type");

  return (
    <button class={className()} type={props.type ?? "button"} {...rest}>
      {props.leadingIcon}
      {props.children}
    </button>
  );
}
