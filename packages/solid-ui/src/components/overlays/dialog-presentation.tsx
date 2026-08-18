import type { JSX } from "@solidjs/web";
import type { Component } from "solid-js";
import { createMemo, omit, type ParentProps } from "solid-js";

import { IconX } from "@/components/media/icons";
import { cn } from "@/lib/cn";

/**
 * Internal shared presentation for the Kobalte dialog-family providers
 * (Dialog and AlertDialog). The two public components keep their separate
 * semantic providers and re-export only their own provider parts; visual
 * recipes and layout helpers live here once.
 */

export const dialogOverlayClass =
  "fixed inset-0 z-50 bg-black/55 backdrop-blur-sm";

export const dialogContentClass =
  "fixed inset-x-0 bottom-4 top-auto z-50 mx-auto grid max-h-[calc(100dvh-2rem)] w-[min(100%-2rem,32rem)] translate-y-0 gap-4 overflow-y-auto rounded-[var(--radius-xl)] border border-border bg-card p-6 shadow-xl sm:bottom-auto sm:top-[50%] sm:translate-y-[-50%]";

const dialogCloseButtonClass =
  "absolute end-4 top-4 inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const dialogTitleClass = "text-lg font-semibold leading-none tracking-tight";

export const dialogDescriptionClass = "text-base leading-6 text-foreground";

interface CloseButtonPartProps {
  "aria-label"?: string;
  class?: string;
  children?: JSX.Element;
}

export function DialogCloseButtonLayout(props: {
  part: Component<CloseButtonPartProps>;
}) {
  return (
    <props.part aria-label="Close" class={dialogCloseButtonClass}>
      <IconX class="size-5" />
    </props.part>
  );
}

export function DialogHeaderLayout(
  props: ParentProps<JSX.HTMLAttributes<HTMLDivElement>>,
) {
  const className = createMemo(() =>
    cn("flex flex-col space-y-1.5 pe-14 text-start", props.class),
  );
  const rest = omit(props, "class");

  return (
    <div class={className()} {...rest}>
      {props.children}
    </div>
  );
}

export function DialogFooterLayout(
  props: ParentProps<JSX.HTMLAttributes<HTMLDivElement>>,
) {
  const className = createMemo(() =>
    cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", props.class),
  );
  const rest = omit(props, "class");

  return (
    <div class={className()} {...rest}>
      {props.children}
    </div>
  );
}
