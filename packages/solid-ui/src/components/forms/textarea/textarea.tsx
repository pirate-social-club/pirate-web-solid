import type { JSX } from "@solidjs/web";
import { createMemo, omit } from "solid-js";

import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "@/lib/recipe";

export const textareaVariants = cva(
  "flex min-h-28 w-full rounded-2xl border border-input bg-background px-4 py-3 text-base shadow-sm transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground focus-visible:border-border focus-visible:ring-1 focus-visible:ring-border-soft disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "",
        flat: "rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface TextareaProps
  extends Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, "class">,
    VariantProps<typeof textareaVariants> {
  class?: string;
}

export function Textarea(props: TextareaProps) {
  const className = createMemo(() =>
    cn(textareaVariants({ variant: props.variant }), props.class),
  );
  const rest = omit(props, "class", "variant");

  return <textarea dir="auto" class={className()} {...rest} />;
}
