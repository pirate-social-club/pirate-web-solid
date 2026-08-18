import type { JSX } from "@solidjs/web";
import { createMemo, omit } from "solid-js";

import { cn } from "@/lib/cn";
import { cva, type VariantProps } from "@/lib/recipe";

const spinnerVariants = cva("animate-spin text-current motion-reduce:animate-none", {
  variants: {
    size: {
      sm: "size-4",
      default: "size-5",
      lg: "size-8",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export interface SpinnerProps
  extends Omit<JSX.SvgSVGAttributes<SVGSVGElement>, "class" | "ref">,
    VariantProps<typeof spinnerVariants> {
  class?: string;
  label?: string;
  /**
   * Hides the spinner from assistive technology. Use inside a control that
   * already conveys busy state (Button/IconButton loading); standalone
   * spinners keep role="status" and an accessible name.
   */
  decorative?: boolean;
}

export function Spinner(props: SpinnerProps) {
  const className = createMemo(() =>
    cn(spinnerVariants({ size: props.size }), props.class),
  );
  const rest = omit(props, "class", "size", "label", "decorative");

  return (
    <svg
      aria-hidden={props.decorative ? "true" : undefined}
      aria-label={props.decorative ? undefined : props.label ?? "Loading"}
      class={className()}
      fill="none"
      role={props.decorative ? undefined : "status"}
      viewBox="0 0 24 24"
      {...rest}
    >
      <circle
        cx="12"
        cy="12"
        opacity="0.2"
        r="9"
        stroke="currentColor"
        stroke-width="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-width="3"
      />
    </svg>
  );
}
