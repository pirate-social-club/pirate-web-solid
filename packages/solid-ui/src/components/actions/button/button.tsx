import { Button as KButton, type ButtonRootProps } from "@kobalte/core/button";
import type { JSX } from "@solidjs/web";
import { createMemo, omit, type ParentProps } from "solid-js";

import { Spinner } from "@/components/feedback/spinner/spinner";
import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "@/lib/recipe";
export const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-base font-semibold transition-[color,box-shadow,background-color] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive-hover",
        outline:
          "border border-border bg-card text-card-foreground hover:bg-card-hover",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/85",
        ghost: "text-foreground hover:bg-muted",
        link: "text-primary-text underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 px-4",
        lg: "h-12 px-6 text-base",
        icon: "size-11 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends Omit<
      JSX.ButtonHTMLAttributes<HTMLButtonElement>,
      "disabled" | "type" | "ref" | "tabindex" | "size"
    >,
    ButtonRootProps,
    VariantProps<typeof buttonVariants> {
  type?: "button" | "submit" | "reset";
  leadingIcon?: JSX.Element;
  trailingIcon?: JSX.Element;
  loading?: boolean;
}

export function Button(props: ParentProps<ButtonProps>) {
  const className = createMemo(() =>
    cn(buttonVariants({ variant: props.variant, size: props.size }), props.class),
  );
  const rest = omit(
    props,
    "class",
    "variant",
    "size",
    "leadingIcon",
    "trailingIcon",
    "loading",
    "children",
    "aria-busy",
    "disabled",
    "type",
  );

  return (
    <KButton
      {...rest}
      class={className()}
      disabled={props.disabled || props.loading}
      type={props.type ?? "button"}
      aria-busy={props.loading ? "true" : props["aria-busy"]}
    >
      {props.loading
        ? <Spinner size="sm" class="[animation-duration:0.9s]" decorative />
        : props.leadingIcon}
      {props.children}
      {props.loading ? undefined : props.trailingIcon}
    </KButton>
  );
}
