import { Show } from "solid-js";

import { Button, Card, CardContent, Type, cn } from "../../../design-system";
import {
  formatBookingDate,
  formatCentsAsUsdc,
  formatSlotDuration,
  formatSlotTime,
  formatTzLabel,
} from "../booking-format";
import type { BookingState, IanaTz, IsoInstant } from "../view-models";
import {
  getBookingStateDisplay,
  getBookingStatusActions,
  type BookingStateDisplay,
} from "./booking-status-card-model";

export interface BookingStatusCardProps {
  state: BookingState;
  hostName: string;
  startUtc: IsoInstant;
  endUtc: IsoInstant;
  priceCents: number;
  viewerTimezone: IanaTz;
  canJoinSession: boolean;
  joinDisabledReason?: string;
  onJoin?: () => void;
  onAddToCalendar?: () => void;
  onCancel?: () => void;
  class?: string;
}

const toneClass = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
} satisfies Record<BookingStateDisplay["tone"], string>;

export function BookingStatusCard(props: BookingStatusCardProps) {
  const display = () => getBookingStateDisplay(props.state);
  const actions = () => getBookingStatusActions(props.state);

  return (
    <Card class={props.class}>
      <CardContent class="flex flex-col gap-4 p-6">
        <div class="flex flex-col gap-1">
          <Type variant="label" class={cn(toneClass[display().tone])}>{display().label}</Type>
          <Type variant="caption">{display().description}</Type>
        </div>

        <div class="flex flex-col gap-1">
          <Type variant="body-strong">{props.hostName}</Type>
          <Type variant="body">
            {formatBookingDate(props.startUtc, props.viewerTimezone)}{" at "}{formatSlotTime(props.startUtc, props.viewerTimezone)}
          </Type>
          <Type variant="caption">
            {formatSlotDuration(props.startUtc, props.endUtc)}{" · "}{formatTzLabel(props.viewerTimezone)}
          </Type>
        </div>

        <div class="flex items-center justify-between">
          <Type variant="caption">Total paid</Type>
          <Type variant="body-strong">{formatCentsAsUsdc(props.priceCents)}</Type>
        </div>

        <Show when={actions().join}>
          <div class="flex flex-col gap-2">
            <Button
              class="w-full"
              disabled={!props.canJoinSession}
              onClick={props.onJoin}
              size="lg"
            >
              {props.state === "live" ? "Rejoin" : "Join"}
            </Button>
            <Show when={!props.canJoinSession && props.joinDisabledReason}>
              <Type variant="caption">{props.joinDisabledReason}</Type>
            </Show>
          </div>
        </Show>

        <Show when={actions().addToCalendar}>
          <Button class="w-full" onClick={props.onAddToCalendar} variant="secondary">
            Add
          </Button>
        </Show>

        <Show when={actions().cancel}>
          <Button class="w-full" onClick={props.onCancel} variant="ghost">
            Cancel
          </Button>
        </Show>
      </CardContent>
    </Card>
  );
}
