import type { JSX } from "@solidjs/web";
import { createMemo, omit, type ParentProps } from "solid-js";

import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "@/lib/recipe";

export const mediaControlButtonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border transition-[color,box-shadow,background-color,border-color] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      intent: {
        default: "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover",
        subtle: "border-border bg-card text-foreground shadow-sm hover:bg-card-hover",
        muted: "border-transparent bg-transparent text-muted-foreground",
        danger: "border-transparent bg-transparent text-destructive-text",
      },
      size: {
        sm: "size-8",
        md: "size-10",
        lg: "size-11",
      },
    },
    defaultVariants: {
      intent: "default",
      size: "sm",
    },
  },
);

export interface MediaControlButtonProps
  extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "ref">,
    VariantProps<typeof mediaControlButtonVariants> {}

export function MediaControlButton(props: ParentProps<MediaControlButtonProps>) {
  const className = createMemo(() =>
    cn(mediaControlButtonVariants({ intent: props.intent, size: props.size }), props.class),
  );
  const rest = omit(props, "class", "intent", "size", "children", "type");

  return (
    <button class={className()} type={props.type ?? "button"} {...rest}>
      {props.children}
    </button>
  );
}
