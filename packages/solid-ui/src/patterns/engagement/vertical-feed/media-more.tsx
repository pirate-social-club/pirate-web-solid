import { createSignal, For } from "solid-js";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/overlays/dropdown-menu/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/overlays/sheet/sheet";
import { IconDotsThree } from "@/components/media/icons";
import { cn } from "@/lib/cn";

import type { MediaMoreAction } from "./types";

export interface MediaMoreProps {
  readonly isMuted: boolean;
  readonly onToggleMute: () => void;
  /** Host rows listed after the built-in Mute/Unmute row. */
  readonly actions?: readonly MediaMoreAction[];
  /**
   * The host's header owns the phone top right (e.g. a Sign in action): sit
   * below it instead. Never hidden, since it holds the only Mute/Unmute.
   */
  readonly belowHeader?: boolean;
}

interface MoreRow {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
}

const MORE_LABEL = "More options";
const PHONE_TOP = "calc(env(safe-area-inset-top, 0px) + 4px)";
/** Clears the host's 4rem mobile header. */
const PHONE_TOP_BELOW_HEADER = "calc(env(safe-area-inset-top, 0px) + 4rem + 4px)";

/**
 * MediaMore - the post's More control: three dots at the top right of the
 * video. Desktop opens a menu under the button; phone opens a bottom sheet.
 * Both list the built-in Mute/Unmute row followed by host-supplied actions.
 * A host action runs after its surface has closed and returned focus, so a
 * follow-up dialog (e.g. Report) opens from a settled page.
 */
export function MediaMore(props: MediaMoreProps) {
  const [sheetOpen, setSheetOpen] = createSignal(false);
  let pendingSheetAction: (() => void) | undefined;
  let pendingMenuAction: (() => void) | undefined;

  const rows = (): readonly MoreRow[] => [
    {
      id: "mute",
      label: props.isMuted ? "Unmute" : "Mute",
      onSelect: () => props.onToggleMute(),
    },
    ...(props.actions ?? []),
  ];

  const runAfterClose = (action: (() => void) | undefined) => {
    if (action) setTimeout(action, 0);
  };

  return (
    <>
      {/* Desktop: 52px translucent circle inside the card, menu below it */}
      <div class="absolute right-3 top-3 z-40 max-md:hidden" data-media-more="desktop">
        {/* Non-modal: a modal menu aria-hides the feed while its controls
            stay focusable. Focus still moves into the menu; Escape and an
            outside press close it. */}
        <DropdownMenu
          placement="bottom-end"
          gutter={8}
          modal={false}
          onOpenChange={(open) => {
            if (open) return;
            const action = pendingMenuAction;
            pendingMenuAction = undefined;
            runAfterClose(action);
          }}
        >
          <DropdownMenuTrigger
            aria-label={MORE_LABEL}
            class="flex size-[52px] cursor-pointer items-center justify-center rounded-full bg-black/30 text-foreground transition-colors hover:bg-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event: MouseEvent) => event.stopPropagation()}
          >
            <IconDotsThree class="size-7" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            class="w-[220px] min-w-0 rounded-[var(--radius-lg)] border-border-soft bg-card p-1 text-foreground shadow-none outline-none"
          >
            <For each={rows()}>
              {(row) => (
                <DropdownMenuItem
                  class="h-11 rounded-[var(--radius-md)] py-0 pe-3 ps-3 text-base leading-6 text-foreground"
                  data-media-more-row={row.id}
                  onSelect={() => {
                    if (row.id === "mute") row.onSelect();
                    else pendingMenuAction = row.onSelect;
                  }}
                >
                  {row.label}
                </DropdownMenuItem>
              )}
            </For>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Phone: 56px unfilled hit area at the top right, rows in a sheet */}
      <div
        class="absolute right-1 z-40 md:hidden"
        style={{ top: props.belowHeader ? PHONE_TOP_BELOW_HEADER : PHONE_TOP }}
        data-media-more="phone"
      >
        <button
          type="button"
          aria-label={MORE_LABEL}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen() ? "true" : "false"}
          class="flex size-14 cursor-pointer items-center justify-center rounded-full text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => {
            event.stopPropagation();
            setSheetOpen(true);
          }}
        >
          <IconDotsThree class="size-8" />
        </button>
      </div>
      {/* The sheet keeps its visible close (ruling 2026-10-16). Its header is
          the close control's height, so the first row starts below it. */}
      <Sheet open={sheetOpen()} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          class="gap-0 border-x-0 border-b-0 border-t border-border bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_24px_80px_#0000002E] md:hidden"
          onCloseAutoFocus={() => {
            const action = pendingSheetAction;
            pendingSheetAction = undefined;
            runAfterClose(action);
          }}
        >
          <SheetTitle class="sr-only">{MORE_LABEL}</SheetTitle>
          <div class="flex h-11 justify-center" data-media-more-header>
            <div aria-hidden="true" class="h-1.5 w-12 rounded-full bg-border" />
          </div>
          <div class="flex flex-col">
            <For each={rows()}>
              {(row, index) => (
                <button
                  type="button"
                  class={cn(
                    "flex w-full cursor-pointer items-center text-start text-base leading-6 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    index() === 0 ? "h-14 pt-2" : "h-12 border-t border-border-soft",
                  )}
                  data-media-more-row={row.id}
                  onClick={() => {
                    if (row.id === "mute") {
                      row.onSelect();
                      setSheetOpen(false);
                      return;
                    }
                    pendingSheetAction = row.onSelect;
                    setSheetOpen(false);
                  }}
                >
                  {row.label}
                </button>
              )}
            </For>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
