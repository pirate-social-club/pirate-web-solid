import { For, Show } from "solid-js";

import { Avatar, Card, CardContent, Type, cn } from "../../../design-system";
import { formatBookingDate, formatCentsAsUsdc, formatSlotTime } from "../booking-format";
import type { BookingState, IanaTz, IsoInstant } from "../view-models";
import { bookingStateGroup, bookingStateLabel } from "./bookings-list-model";

export interface BookingListItem {
  id: string;
  hostName: string;
  hostPhotoSrc?: string | null;
  startUtc: IsoInstant;
  endUtc: IsoInstant;
  state: BookingState;
  priceCents: number;
}

export interface BookingsListProps {
  items: BookingListItem[];
  viewerTimezone: IanaTz;
  onSelectBooking?: (item: BookingListItem) => void;
  class?: string;
}

export function BookingsList(props: BookingsListProps) {
  return (
    <Show when={props.items.length > 0} fallback={<Card class={props.class}><CardContent class="p-6 text-center"><Type variant="caption">No bookings yet.</Type></CardContent></Card>}>
      <div class={cn("flex flex-col gap-3", props.class)} data-bookings-count={props.items.length}>
        <For each={props.items}>
          {(item) => <button aria-label={`${item.hostName}, ${bookingStateLabel(item.state)}`} class="flex items-center gap-4 rounded-[var(--radius-lg)] border border-border-soft bg-card p-4 text-left transition-colors hover:bg-card/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => props.onSelectBooking?.(item)} type="button">
            <Avatar fallback={item.hostName} src={item.hostPhotoSrc ?? undefined} />
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <div class="flex items-center justify-between gap-2"><Type class="truncate" variant="body-strong">{item.hostName}</Type><Type class="shrink-0" variant="body-strong">{formatCentsAsUsdc(item.priceCents)}</Type></div>
              <div class="flex flex-wrap items-center justify-between gap-2"><Type variant="caption">{formatBookingDate(item.startUtc, props.viewerTimezone)}{" at "}{formatSlotTime(item.startUtc, props.viewerTimezone)}</Type><Type class={cn(bookingStateGroup(item.state) === "cancelled" && "text-warning")} variant="caption">{bookingStateLabel(item.state)}</Type></div>
            </div>
          </button>}
        </For>
      </div>
    </Show>
  );
}
