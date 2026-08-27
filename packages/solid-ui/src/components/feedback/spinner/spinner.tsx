import type { JSX } from "@solidjs/web";
import { createMemo, omit } from "solid-js";

import { IconArrowsClockwise } from "@/components/media/icons";
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
  const rest = omit(
    props,
    "class",
    "size",
    "label",
    "decorative",
    "aria-hidden",
    "aria-label",
    "role",
  );

  return (
    <IconArrowsClockwise
      aria-hidden={props.decorative ? "true" : "false"}
      aria-label={props.decorative ? undefined : props.label ?? "Loading"}
      class={className()}
      role={props.decorative ? undefined : "status"}
      {...rest}
    />
  );
}
