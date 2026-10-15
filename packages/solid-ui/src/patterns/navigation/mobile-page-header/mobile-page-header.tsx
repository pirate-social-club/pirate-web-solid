import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { IconButton } from "@/components/actions/icon-button/icon-button";
import { Avatar } from "@/components/data-display/avatar/avatar";
import { Type } from "@/components/data-display/type/type";
import { IconArrowLeft, IconX } from "@/components/media/icons";
import { cn } from "@/lib/cn";

export interface MobilePageHeaderProps {
  backAriaLabel?: string;
  backIcon?: JSX.Element;
  class?: string;
  closeAriaLabel?: string;
  closeIcon?: JSX.Element;
  /**
   * `compact` is the Paper page header: 56 tall, a 40px back target with a
   * 20px mark, a 24px title avatar and a 16px title. The default keeps the
   * taller header existing pages were built against.
   */
  density?: "default" | "compact";
  onBackClick?: () => void;
  onCloseClick?: () => void;
  onTitleClick?: () => void;
  title: string;
  titleActionAriaLabel?: string;
  titleAvatarFallback?: string;
  titleAvatarSeed?: string;
  titleAvatarSrc?: string | null;
  trailingAction?: JSX.Element;
}

export function MobilePageHeader(props: MobilePageHeaderProps) {
  const compact = () => props.density === "compact";
  const titleContent = () => (
    <span class="flex min-w-0 items-center justify-center gap-2 text-start">
      <Show when={props.titleAvatarFallback || props.titleAvatarSrc}>
        <Avatar
          class={compact() ? "size-6 shrink-0 text-[10px] leading-3" : "size-8 shrink-0"}
          fallback={props.titleAvatarFallback ?? props.title}
          fallbackSeed={props.titleAvatarSeed}
          size={compact() ? "xs" : "sm"}
          src={props.titleAvatarSrc ?? undefined}
        />
      </Show>
      <Type as="span" variant="h4" class={compact() ? "truncate text-base leading-6 tracking-normal" : "truncate"}>
        {props.title}
      </Type>
    </span>
  );
  const actionClass = () => (compact() ? "size-10" : undefined);
  const iconClass = () => (compact() ? "size-5" : "size-6");

  return (
    <header class={cn("fixed inset-x-0 top-0 z-40 border-b border-border-soft bg-background pt-[env(safe-area-inset-top)]", props.class)}>
      <div class={compact() ? "flex h-14 items-center justify-between gap-2 px-5" : "flex h-[var(--header-height)] items-center justify-between gap-3 px-4"}>
        <div class={cn("flex shrink-0 items-center justify-start", compact() ? "min-w-10" : "min-w-11")}>
          <Show when={props.onCloseClick} fallback={props.onBackClick ? (
            <IconButton aria-label={props.backAriaLabel ?? "Back"} class={actionClass()} onClick={() => props.onBackClick?.()} variant="ghost">
              {props.backIcon ?? <IconArrowLeft class={iconClass()} />}
            </IconButton>
          ) : undefined}>
            <IconButton aria-label={props.closeAriaLabel ?? "Close"} class={actionClass()} onClick={() => props.onCloseClick?.()} variant="ghost">
              {props.closeIcon ?? <IconX class={iconClass()} />}
            </IconButton>
          </Show>
        </div>
        <div class="min-w-0 flex-1 text-center">
          <Show when={props.onTitleClick} fallback={<div class="min-w-0 max-w-full">{titleContent()}</div>}>
            <button
              aria-label={props.titleActionAriaLabel ?? `Open ${props.title}`}
              class="inline-flex max-w-full items-center justify-center rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => props.onTitleClick?.()}
              type="button"
            >
              {titleContent()}
            </button>
          </Show>
        </div>
        <div class={cn("flex shrink-0 items-center justify-end", compact() ? "min-w-10" : "min-w-11")}>{props.trailingAction}</div>
      </div>
    </header>
  );
}
