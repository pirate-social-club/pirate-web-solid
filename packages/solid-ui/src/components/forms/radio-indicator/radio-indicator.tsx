import type { JSX } from "@solidjs/web";
import { createMemo, omit } from "solid-js";

import { cn } from "@/lib/cn";

export interface RadioIndicatorProps
  extends Omit<JSX.HTMLAttributes<HTMLSpanElement>, "class"> {
  class?: string;
  /** Whether the indicator represents a selected option. */
  checked?: boolean;
}

/**
 * RadioIndicator - the round selection dot used by option surfaces (e.g.
 * OptionCard). Purely presentational; the selection semantics belong to the
 * host control.
 */
export function RadioIndicator(props: RadioIndicatorProps) {
  const className = createMemo(() =>
    cn(
      "relative size-6 shrink-0 rounded-full border-2 bg-transparent transition-colors",
      props.checked ? "border-primary" : "border-border",
      props.checked &&
        "after:absolute after:left-1/2 after:top-1/2 after:size-3 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:bg-primary after:content-['']",
      props.class,
    ),
  );
  const rest = omit(props, "class", "checked");

  return (
    <span
      aria-hidden="true"
      class={className()}
      data-checked={props.checked ? "" : undefined}
      {...rest}
    />
  );
}
