import type { JSX } from "@solidjs/web";
import { createMemo, omit } from "solid-js";

import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "@/lib/recipe";

export const prefixInputVariants = cva(
  "flex items-center overflow-hidden rounded-full border border-input bg-background shadow-sm transition-[color,box-shadow,border-color] focus-within:border-border focus-within:ring-1 focus-within:ring-border-soft has-disabled:cursor-not-allowed has-disabled:opacity-50",
  {
    variants: {
      size: {
        default: "h-12",
        lg: "h-14",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export interface PrefixInputProps
  extends Omit<
      JSX.InputHTMLAttributes<HTMLInputElement>,
      "class" | "size" | "prefix"
    >,
    VariantProps<typeof prefixInputVariants> {
  class?: string;
  /** Leading adornment shown before the input. */
  prefix: JSX.Element;
  /** Extra classes for the prefix column. */
  prefixClass?: string;
}

/**
 * PrefixInput - an input with a fixed leading adornment column (currency
 * symbol, unit, domain). The adornment is decorative chrome; the input keeps
 * all native text-entry semantics.
 */
export function PrefixInput(props: PrefixInputProps) {
  const className = createMemo(() =>
    cn(prefixInputVariants({ size: props.size }), props.class),
  );
  const rest = omit(props, "class", "size", "prefix", "prefixClass");

  return (
    <div class={className()}>
      <div
        aria-hidden="true"
        class={cn(
          "grid h-full w-12 shrink-0 place-items-center border-e border-border-soft bg-muted/40 text-xl font-semibold text-foreground",
          props.prefixClass,
        )}
      >
        {props.prefix}
      </div>
      <input
        class="h-full w-full rounded-none border-0 bg-transparent px-4 text-base outline-none placeholder:text-muted-foreground focus:ring-0 focus:ring-offset-0"
        dir="auto"
        {...rest}
      />
    </div>
  );
}
