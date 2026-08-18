import {
  Separator as KSeparator,
  type SeparatorRootProps as KSeparatorRootProps,
} from "@kobalte/core/separator";
import { createMemo, omit } from "solid-js";

import { cn } from "@/lib/cn";

export interface SeparatorProps extends KSeparatorRootProps {
  class?: string;
  decorative?: boolean;
}

export function Separator(props: SeparatorProps) {
  const orientation = () => props.orientation ?? "horizontal";
  const className = createMemo(() =>
    cn(
      "shrink-0 bg-border",
      orientation() === "horizontal" ? "h-px w-full" : "h-full w-px",
      props.class,
    ),
  );
  const rest = omit(props, "class", "orientation", "decorative");

  return (
    <KSeparator
      class={className()}
      orientation={orientation()}
      role={props.decorative === false ? undefined : "none"}
      {...rest}
    />
  );
}
