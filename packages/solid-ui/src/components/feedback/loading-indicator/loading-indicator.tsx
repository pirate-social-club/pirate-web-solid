import type { JSX } from "@solidjs/web";
import { omit } from "solid-js";

import { cn } from "@/lib/cn";
import { Spinner } from "../spinner/spinner";

export interface LoadingIndicatorProps
  extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "children" | "class" | "ref"> {
  class?: string;
  /** Accessible status name; no visible loading copy is rendered. */
  label?: string;
  variant?: "page" | "section" | "inline";
}

/** One busy status owns the label; the animated spinner is decorative. */
export function LoadingIndicator(props: LoadingIndicatorProps) {
  const rest = omit(props, "class", "label", "variant", "role", "aria-label", "aria-busy");
  return (
    <div
      {...rest}
      aria-busy="true"
      aria-label={props.label ?? "Loading"}
      class={cn(
        "grid place-items-center text-muted-foreground",
        props.variant === "page" ? "min-h-dvh w-full bg-background" :
          props.variant === "inline" ? "py-2" : "min-h-48 w-full",
        props.class,
      )}
      role="status"
    >
      <Spinner decorative size={props.variant === "page" ? "lg" : "default"} />
    </div>
  );
}
