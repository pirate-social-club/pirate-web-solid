import type { JSX } from "@solidjs/web";
import { Show, createEffect, createSignal, onCleanup } from "solid-js";

import { IconButton, IconX, Sheet, SheetContent, Type, cn } from "../../../design-system";
import { FEED_DOCK_QUERY } from "./feed-side-panel-model";

export function FeedPanelLayout(props: {
  children: JSX.Element;
  class?: string;
  panel?: JSX.Element;
}) {
  return (
    <div class={cn("grid min-h-0 w-full grid-cols-1", props.panel && "xl:grid-cols-[minmax(0,1fr)_26rem]", props.class)} data-feed-panel-layout>
      <div class="min-h-0 min-w-0">{props.children}</div>
      {props.panel}
    </div>
  );
}

export interface FeedSidePanelProps {
  children: JSX.Element;
  closeLabel: string;
  description?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
  initialFocusRef?: HTMLElement;
  returnFocusRef?: HTMLElement;
}

/** Responsive comments/booking surface: dock on wide screens and bottom sheet on mobile. */
export function FeedSidePanel(props: FeedSidePanelProps) {
  const close = () => {
    props.onOpenChange(false);
    props.returnFocusRef?.focus();
  };
  const docked = createIsFeedDocked();

  createEffect(
    () => props.open,
    (open) => {
      if (open) props.initialFocusRef?.focus();
    },
  );

  const handleOpenChange = (open: boolean) => {
    props.onOpenChange(open);
    if (!open) props.returnFocusRef?.focus();
  };

  return (
    <Show when={props.open}>
      <Show
        when={docked()}
        fallback={
          <Sheet onOpenChange={handleOpenChange} open>
            <SheetContent aria-label={props.title} class="flex h-[88dvh] w-full flex-col overflow-hidden px-0 pb-[env(safe-area-inset-bottom)]" hideCloseButton side="bottom">
              <PanelHeader close={() => handleOpenChange(false)} closeLabel={props.closeLabel} description={props.description} title={props.title} />
              <div class="min-h-0 flex-1 overflow-hidden">{props.children}</div>
            </SheetContent>
          </Sheet>
        }
      >
        <aside
          aria-label={props.title}
          class="flex min-h-0 border-s border-border-soft bg-card xl:flex xl:flex-col"
          data-feed-side-panel
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              handleOpenChange(false);
            }
          }}
        >
          <PanelHeader close={close} closeLabel={props.closeLabel} description={props.description} title={props.title} />
          <div class="min-h-0 flex-1 overflow-hidden">{props.children}</div>
        </aside>
      </Show>
    </Show>
  );
}

function createIsFeedDocked() {
  const [docked, setDocked] = createSignal(false, { ownedWrite: true });

  createEffect(
    () => FEED_DOCK_QUERY,
    (query) => {
      if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
      const media = window.matchMedia(query);
      const update = () => setDocked(media.matches);
      update();
      media.addEventListener("change", update);
      onCleanup(() => media.removeEventListener("change", update));
    },
  );

  return docked;
}

function PanelHeader(props: { close: () => void; closeLabel: string; description?: string; title: string }) {
  return (
    <header class="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border-soft px-5">
      <div class="min-w-0">
        <Type as="h2" variant="h3">{props.title}</Type>
        <Show when={props.description}>
          <Type class="line-clamp-1" variant="caption">{props.description}</Type>
        </Show>
      </div>
      <IconButton aria-label={props.closeLabel} class="size-10" onClick={props.close} type="button" variant="ghost"><IconX class="size-5" /></IconButton>
    </header>
  );
}
