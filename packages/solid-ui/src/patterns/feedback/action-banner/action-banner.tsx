import type { JSX } from "@solidjs/web";
import { createMemo, Show } from "solid-js";

import { Type } from "@/components/data-display/type/type";
import { cn } from "@/lib/cn";

export interface ActionBannerProps {
  /** Primary line of the banner. */
  title?: JSX.Element;
  /** Supporting copy under the title. */
  subtitle?: JSX.Element;
  /** Trailing action, typically a compact Button. */
  action?: JSX.Element;
  class?: string;
  id?: string;
}

/**
 * ActionBanner - a one-line call to action with a title, optional supporting
 * subtitle, and an optional trailing action. Use it inside cards, sheets, and
 * detail views to pair copy with one primary action. For multi-action toolbars
 * or grouped buttons, use a dedicated layout surface instead.
 */
export function ActionBanner(props: ActionBannerProps) {
  const className = createMemo(() =>
    cn("flex w-full items-center justify-between gap-3", props.class),
  );

  return (
    <div class={className()} id={props.id}>
      <span class="min-w-0 flex-1 space-y-0.5">
        <Show when={props.title}>
          {(title) => (
            <Type as="span" class="block" variant="body-strong">
              {title()}
            </Type>
          )}
        </Show>
        <Show when={props.subtitle}>
          {(subtitle) => (
            <Type as="span" class="block" variant="caption">
              {subtitle()}
            </Type>
          )}
        </Show>
      </span>
      <Show when={props.action}>
        {(action) => <div class="shrink-0">{action()}</div>}
      </Show>
    </div>
  );
}
