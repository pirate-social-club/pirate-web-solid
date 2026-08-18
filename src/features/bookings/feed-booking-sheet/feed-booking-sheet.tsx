import { For, Show, createSignal } from "solid-js";

import { Button, Card, Spinner, Type, cn } from "../../../design-system";
import type { IanaTz, ResolvedSlot } from "../view-models";
import { SlotPicker } from "../slot-picker/slot-picker";
import { FeedPanelLayout, FeedSidePanel } from "../../posts/feed-side-panel/feed-side-panel";
import { formatFeedBookingPrice, getFeedBookingState } from "./feed-booking-sheet-model";

export interface FeedBookingSheetBodyProps {
  startingPriceCents: number;
  error?: boolean;
  loading?: boolean;
  slots: ResolvedSlot[];
  viewerTimezone: IanaTz;
  onRetry?: () => void;
  onSelectSlot?: (slot: ResolvedSlot) => void;
  class?: string;
}

/** Booking availability body shared by feed docks and mobile sheets. */
export function FeedBookingSheetBody(props: FeedBookingSheetBodyProps) {
  const state = () => getFeedBookingState(props.slots, props);

  return (
    <section aria-label="Booking availability" class={cn("space-y-4", props.class)} data-booking-sheet-state={state()}>
      <div class="flex items-start justify-between gap-4">
        <div class="space-y-1">
          <Type as="h3" variant="h3">Book a session</Type>
          <Type variant="caption">Choose an available time in your timezone.</Type>
        </div>
        <Type variant="body-strong">From {formatFeedBookingPrice(props.startingPriceCents)}</Type>
      </div>

      <Show when={state() === "error"}>
        <Card class="space-y-4 border-destructive/30 bg-destructive/10 p-5" role="alert">
          <Type variant="body">Availability could not be loaded.</Type>
          <Button onClick={() => props.onRetry?.()} type="button">Retry</Button>
        </Card>
      </Show>

      <Show when={state() === "loading"}>
        <div class="grid min-h-32 place-items-center rounded-[var(--radius-md)] border border-border-soft bg-card" role="status">
          <Spinner label="Loading availability" size="lg" />
        </div>
      </Show>

      <Show when={state() === "empty"}>
        <Card class="p-6 text-center">
          <Type variant="body">No open times are available.</Type>
        </Card>
      </Show>

      <Show when={state() === "ready"}>
        <div class="space-y-3" data-booking-slot-list>
          <Type variant="label">Available times</Type>
          <SlotPicker
            onSelectSlot={props.onSelectSlot}
            slots={props.slots}
            viewerTimezone={props.viewerTimezone}
          />
        </div>
      </Show>

      <Show when={props.slots.length > 0 && state() === "ready"}>
        <div class="flex flex-wrap gap-2" data-booking-day-summary>
          <For each={[...new Set(props.slots.map((slot) => slot.startUtc.slice(0, 10)))]}>
            {(day) => <Type variant="caption">{day}</Type>}
          </For>
        </div>
      </Show>
    </section>
  );
}

export interface FeedBookingPanelProps extends FeedBookingSheetBodyProps {
  handle?: string;
  class?: string;
}

/** Closed-by-default booking trigger that owns the responsive dock/sheet lifecycle. */
export function FeedBookingPanel(props: FeedBookingPanelProps) {
  const [open, setOpen] = createSignal(false);
  const [triggerRef, setTriggerRef] = createSignal<HTMLElement>();

  return (
    <FeedPanelLayout
      class={cn("min-h-[24rem] bg-background", props.class)}
      panel={open() ? (
        <FeedSidePanel
          closeLabel="Close booking"
          description="Choose an available time."
          onOpenChange={setOpen}
          open
          returnFocusRef={triggerRef()}
          title={`Book ${props.handle ?? "this creator"}`}
        >
          <div class="h-full overflow-y-auto p-5">
            <FeedBookingSheetBody {...props} />
          </div>
        </FeedSidePanel>
      ) : undefined}
    >
      <div class="grid min-h-[24rem] place-items-center">
        <Button
          aria-expanded={open() ? "true" : "false"}
          onClick={() => setOpen(true)}
          ref={(element) => { setTriggerRef(element); }}
          type="button"
        >
          Book
        </Button>
      </div>
    </FeedPanelLayout>
  );
}
