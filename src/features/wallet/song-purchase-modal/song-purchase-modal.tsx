import { Show } from "solid-js";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormNote,
  Type,
} from "../../../design-system";
import {
  formatSavingsPercent,
  purchaseButtonLabel,
  selfVerificationLabel,
  stateDefaults,
} from "./song-purchase-modal-model";
import type { SongPurchaseModalProps } from "./song-purchase-modal.types";

function SummaryRow(props: { label: string; value: string }) {
  return (
    <div class="flex items-center justify-between gap-4 py-3">
      <Type as="div" class="min-w-0 text-muted-foreground" variant="body">{props.label}</Type>
      <Type as="div" class="min-w-0 truncate text-end" variant="body-strong">{props.value}</Type>
    </div>
  );
}

export function SongPurchaseModal(props: SongPurchaseModalProps) {
  const defaults = () => stateDefaults(props.state);
  const confirmedDiscountPercent = () => props.confirmedDiscountPercent ?? defaults().confirmedDiscountPercent;
  const processing = () => props.processing ?? defaults().processing;
  const error = () => props.error ?? defaults().error;
  const savingsPercent = () => props.selfVerificationSavingsPercent ?? defaults().selfVerificationSavingsPercent;
  const vinylReleaseAvailable = () => props.vinylReleaseAvailable ?? defaults().vinylReleaseAvailable;
  const hasConfirmedDiscount = () => typeof confirmedDiscountPercent() === "number" && confirmedDiscountPercent()! > 0;
  const savingsLabel = () => !hasConfirmedDiscount() && typeof savingsPercent() === "number" && savingsPercent()! > 0
    ? selfVerificationLabel(savingsPercent())
    : null;

  return (
    <Dialog onOpenChange={props.onOpenChange} open={props.open}>
      <DialogContent class="flex max-h-[90vh] flex-col overflow-y-auto px-5 pb-6 pt-5 sm:max-w-2xl sm:px-8 sm:pb-8 sm:pt-8">
        <DialogHeader class="space-y-5 pe-10 text-start">
          <DialogTitle>{props.songTitle}</DialogTitle>
          <DialogDescription class="w-full text-foreground">Get a downloadable copy of this song.</DialogDescription>
        </DialogHeader>

        <div class="mt-8 space-y-6">
          <div class="divide-y divide-border-soft border-y border-border-soft">
            <SummaryRow label="Price" value={props.priceLabel} />
            <Show when={hasConfirmedDiscount()}>
              <SummaryRow label="Self.xyz discount" value={`${formatSavingsPercent(confirmedDiscountPercent() ?? 0)}% off`} />
            </Show>
          </div>

          <Show when={vinylReleaseAvailable()}>
            <FormNote>Vinyl available after unlock. Sold separately on ElasticStage.</FormNote>
          </Show>

          <Show when={savingsLabel()}>
            <div class="flex flex-col gap-3 rounded-lg border border-border-soft bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <Type as="p" class="min-w-0" variant="body-strong">{savingsLabel()}</Type>
              <Show when={props.onSelfVerificationClick}>
                <Button class="w-full sm:w-auto" onClick={() => props.onSelfVerificationClick?.()} size="sm" variant="outline">Verify</Button>
              </Show>
            </div>
          </Show>

          <Show when={error()}>
            <div aria-live="assertive" role="alert">
              <FormNote tone="warning">{error()}</FormNote>
            </div>
          </Show>

          <DialogFooter>
            <Button
              aria-busy={processing() ? "true" : undefined}
              class="h-14 w-full"
              disabled={processing()}
              loading={processing()}
              onClick={() => props.onConfirm?.()}
            >
              {purchaseButtonLabel(props.priceLabel, processing())}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
