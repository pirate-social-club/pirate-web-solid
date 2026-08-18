import { Show, createMemo } from "solid-js";

import { Button, Card, CardContent, Type, cn } from "../../../design-system";
import { formatCentsAsUsdc } from "../booking-format";
import type { BookingQuotePreview, IanaTz } from "../view-models";
import {
  checkoutHeading,
  formatHoldCountdown,
  secondsUntilHoldExpires,
  type BookingCheckoutPhase,
} from "./booking-checkout-model";

export interface BookingCheckoutProps {
  quote: BookingQuotePreview;
  viewerTimezone: IanaTz;
  phase: BookingCheckoutPhase;
  holdExpiresAtUtc: string;
  nowUtc: string;
  onPay?: () => void;
  onReleaseHold?: () => void;
  class?: string;
}

export function BookingCheckout(props: BookingCheckoutProps) {
  const secondsRemaining = createMemo(() => secondsUntilHoldExpires(props.holdExpiresAtUtc, props.nowUtc));
  return (
    <Card class={props.class} data-booking-checkout data-phase={props.phase}>
      <CardContent class="flex flex-col gap-4 p-6">
        <div class="flex flex-col gap-1">
          <Type as="h2" variant="h3">{checkoutHeading(props.phase)}</Type>
          <Show when={props.phase === "holding"}>
            <Type variant="caption">Pay {formatCentsAsUsdc(props.quote.grossCents)} to confirm your session.</Type>
          </Show>
          <Show when={props.phase === "pending"}>
            <Type variant="caption">Waiting for your payment to be confirmed on-chain. This usually takes a few seconds.</Type>
          </Show>
          <Show when={props.phase === "conflict"}>
            <Type variant="caption">Someone else booked it while you were viewing. Pick another slot to continue.</Type>
          </Show>
        </div>

        <Show when={props.phase === "holding"}>
          <div class="flex flex-col gap-1" aria-live="polite">
            <Type variant="caption">Slot held for</Type>
            <Type as="span" variant="h2" class={cn(secondsRemaining() <= 60 && "text-warning")}>
              {formatHoldCountdown(secondsRemaining())}
            </Type>
          </div>
          <Button class="w-full" onClick={props.onPay} size="lg">
            Pay {formatCentsAsUsdc(props.quote.grossCents)}
          </Button>
          <Show when={props.onReleaseHold}>
            <Button onClick={props.onReleaseHold} variant="ghost">Cancel</Button>
          </Show>
        </Show>

        <Show when={props.phase === "pending"}>
          <div class="flex items-center justify-between gap-3 border-t border-border-soft pt-4">
            <Type variant="body">Total</Type>
            <Type variant="body-strong">{formatCentsAsUsdc(props.quote.grossCents)}</Type>
          </div>
        </Show>

        <Show when={props.phase === "conflict" && props.onReleaseHold}>
          <Button onClick={props.onReleaseHold} variant="secondary">Back to slots</Button>
        </Show>
      </CardContent>
    </Card>
  );
}
