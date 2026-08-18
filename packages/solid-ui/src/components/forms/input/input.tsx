import type { JSX } from "@solidjs/web";
import { createMemo, omit } from "solid-js";

import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "@/lib/recipe";

export const inputVariants = cva(
  "flex w-full rounded-full border border-input bg-background px-4 text-base shadow-sm transition-[color,box-shadow,border-color] outline-none file:border-0 file:bg-transparent file:text-base file:text-foreground file:font-medium placeholder:text-muted-foreground focus-visible:border-border focus-visible:ring-1 focus-visible:ring-border-soft disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "",
        flat: "rounded-none border-0 bg-transparent px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0",
      },
      size: {
        default: "h-11 px-4 py-2",
        lg: "h-16 px-5 py-3",
        title: "h-16 px-6 py-4 text-2xl font-semibold",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface InputProps
  extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "class" | "size">,
    VariantProps<typeof inputVariants> {
  class?: string;
}

export function Input(props: InputProps) {
  const className = createMemo(() =>
    cn(inputVariants({ variant: props.variant, size: props.size }), props.class),
  );
  const rest = omit(props, "class", "variant", "size");

  return <input dir="auto" class={className()} {...rest} />;
}
