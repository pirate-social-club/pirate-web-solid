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
  const titleContent = () => (
    <span class="flex min-w-0 items-center justify-center gap-2 text-start">
      <Show when={props.titleAvatarFallback || props.titleAvatarSrc}>
        <Avatar
          class="size-8 shrink-0"
          fallback={props.titleAvatarFallback ?? props.title}
          fallbackSeed={props.titleAvatarSeed}
          size="sm"
          src={props.titleAvatarSrc ?? undefined}
        />
      </Show>
      <Type as="span" variant="h4" class="truncate">
        {props.title}
      </Type>
    </span>
  );

  return (
    <header class={cn("fixed inset-x-0 top-0 z-40 border-b border-border-soft bg-background pt-[env(safe-area-inset-top)]", props.class)}>
      <div class="flex h-[var(--header-height)] items-center justify-between gap-3 px-4">
        <div class="flex min-w-11 shrink-0 items-center justify-start">
          <Show when={props.onCloseClick} fallback={props.onBackClick ? (
            <IconButton aria-label={props.backAriaLabel ?? "Back"} onClick={() => props.onBackClick?.()} variant="ghost">
              {props.backIcon ?? <IconArrowLeft class="size-6" />}
            </IconButton>
          ) : undefined}>
            <IconButton aria-label={props.closeAriaLabel ?? "Close"} onClick={() => props.onCloseClick?.()} variant="ghost">
              {props.closeIcon ?? <IconX class="size-6" />}
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
        <div class="flex min-w-11 shrink-0 items-center justify-end">{props.trailingAction}</div>
      </div>
    </header>
  );
}
