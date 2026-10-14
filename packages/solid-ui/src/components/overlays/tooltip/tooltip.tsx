import { Tooltip as KTooltip } from "@kobalte/core/tooltip";
import { createMemo, omit, type ParentProps } from "solid-js";

import { cn } from "@/lib/cn";

/**
 * Tooltip root. Kobalte reads placement and gutter from the root, so the
 * Paper defaults live here: above the trigger, 6px away (measured on the
 * Tooltip board). Callers may override.
 */
function Tooltip(props: ParentProps<Parameters<typeof KTooltip>[0]>) {
  return <KTooltip placement="top" gutter={6} {...props} />;
}
const TooltipTrigger = KTooltip.Trigger;

function TooltipContent(
  props: ParentProps<Parameters<typeof KTooltip.Content>[0]>,
) {
  const className = createMemo(() =>
    cn(
      "z-50 overflow-hidden rounded-md border border-border-soft bg-card px-3 py-1.5 text-base text-card-foreground shadow-md",
      props.class,
    ),
  );
  const rest = omit(props, "class", "children");

  return (
    <KTooltip.Portal>
      <KTooltip.Content {...rest} class={className()}>
        {props.children}
      </KTooltip.Content>
    </KTooltip.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipTrigger };
