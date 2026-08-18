import type { JSX } from "@solidjs/web";
import { createMemo, omit, type ParentProps } from "solid-js";

import { buttonVariants } from "@/components/actions/button/button";
import { Spinner } from "@/components/feedback/spinner/spinner";
import { cn } from "@/lib/cn";
import { type VariantProps } from "@/lib/recipe";

export interface IconButtonProps
  extends Omit<
      JSX.ButtonHTMLAttributes<HTMLButtonElement>,
      "class" | "ref" | "type" | "tabindex"
    >,
    Omit<VariantProps<typeof buttonVariants>, "size"> {
  class?: string;
  type?: "button" | "submit" | "reset";
  active?: boolean;
  loading?: boolean;
}

export function IconButton(props: ParentProps<IconButtonProps>) {
  const className = createMemo(() =>
    cn(
      buttonVariants({ variant: props.variant ?? "secondary", size: "icon" }),
      props.active && "border border-primary bg-primary text-primary-foreground",
      props.class,
    ),
  );
  const rest = omit(
    props,
    "class",
    "variant",
    "active",
    "loading",
    "children",
    "aria-busy",
    "disabled",
    "aria-pressed",
  );

  return (
    <button
      class={className()}
      data-active={props.active ? "true" : undefined}
      disabled={props.disabled || props.loading}
      type={props.type ?? "button"}
      aria-busy={props.loading ? "true" : props["aria-busy"]}
      aria-pressed={
        props.active !== undefined
          ? props.active
            ? "true"
            : "false"
          : props["aria-pressed"]
      }
      {...rest}
    >
      {props.loading ? (
        <Spinner size="sm" class="[animation-duration:0.9s]" decorative />
      ) : (
        props.children
      )}
    </button>
  );
}
