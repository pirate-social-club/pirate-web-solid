import type { JSX } from "@solidjs/web";
import { createMemo, omit, type ParentProps } from "solid-js";

import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "@/lib/recipe";

export const pillButtonVariants = cva(
  "inline-flex h-9 cursor-pointer items-center justify-center rounded-full border px-4 text-base font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      tone: {
        default:
          "border-border-soft bg-card text-muted-foreground hover:bg-card-hover hover:text-foreground",
        selected:
          "border-primary bg-primary text-primary-foreground hover:bg-primary-hover",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  },
);

export interface PillButtonProps
  extends Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "ref">,
    VariantProps<typeof pillButtonVariants> {}

export function PillButton(props: ParentProps<PillButtonProps>) {
  const className = createMemo(() =>
    cn(pillButtonVariants({ tone: props.tone }), props.class),
  );
  const rest = omit(props, "class", "tone", "children", "type");

  return (
    <button class={className()} type={props.type ?? "button"} {...rest}>
      {props.children}
    </button>
  );
}
