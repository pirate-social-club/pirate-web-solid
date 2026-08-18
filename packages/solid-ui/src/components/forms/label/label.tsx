import type { JSX } from "@solidjs/web";
import { createMemo, omit, type ParentProps } from "solid-js";

import { typeVariants } from "@/components/data-display/type/type";
import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "@/lib/recipe";

const labelVariants = cva(
  [typeVariants({ variant: "label" }), "peer-disabled:cursor-not-allowed peer-disabled:opacity-70"],
  {
    variants: {
      tone: {
        default: "",
        muted: "text-muted-foreground",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  },
);

export interface LabelProps
  extends Omit<JSX.LabelHTMLAttributes<HTMLLabelElement>, "class" | "ref">,
    VariantProps<typeof labelVariants> {
  class?: string;
}

export function Label(props: ParentProps<LabelProps>) {
  const className = createMemo(() =>
    cn(labelVariants({ tone: props.tone }), props.class),
  );
  const rest = omit(props, "class", "tone", "children");

  return (
    <label class={className()} {...rest}>
      {props.children}
    </label>
  );
}
