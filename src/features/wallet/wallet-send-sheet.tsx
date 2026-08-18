import { createMemo, createSignal, For, Show } from "solid-js";

import {
  Button,
  cn,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextField,
  TextFieldDescription,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
  Type,
} from "../../design-system";
import {
  buildWalletSendSheetView,
  type WalletSendFormState,
} from "./wallet-send-sheet-view-model";
import type { WalletSendSheetProps } from "./wallet-send-sheet.types";

export function WalletSendSheet(props: WalletSendSheetProps) {
  const [assetId, setAssetId] = createSignal<string | undefined>(props.defaultAssetId);
  const [recipient, setRecipient] = createSignal(props.defaultRecipient ?? "");
  const [amount, setAmount] = createSignal(props.amount ?? "");
  const [submitAttempted, setSubmitAttempted] = createSignal(false);

  const form = (): WalletSendFormState => ({
    assetId: assetId(),
    recipient: recipient(),
    amount: amount(),
    submitAttempted: submitAttempted(),
  });
  const view = createMemo(() => buildWalletSendSheetView(props, form()));

  const confirm = () => {
    setSubmitAttempted(true);
    view().submit();
  };

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side={props.forceMobile ? "bottom" : "right"}
        class="flex flex-col"
        aria-label="Send tokens"
      >
        <SheetHeader>
          <SheetTitle>Send</SheetTitle>
          <SheetDescription>Choose an asset, enter a recipient, and confirm the amount.</SheetDescription>
        </SheetHeader>

        <Show
          when={view().hasAssets}
          fallback={<Type variant="caption">No assets with a positive balance to send.</Type>}
        >
          <div class="flex flex-col gap-2">
            <Type variant="overline">Asset</Type>
            <ul class="flex max-h-48 flex-col gap-1 overflow-y-auto" aria-label="Assets">
              <For each={view().assets}>
                {(asset) => (
                  <li>
                    <button
                      type="button"
                      class={cn(
                        "flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2 text-start transition-colors",
                        asset.selected ? "bg-primary-subtle text-primary-text" : "hover:bg-muted",
                      )}
                      aria-pressed={asset.selected ? "true" : "false"}
                      disabled={view().pending}
                      onClick={() => setAssetId(asset.id)}
                    >
                      <span class="flex min-w-0 flex-col">
                        <Type variant="body-strong">{asset.symbol}</Type>
                        <Type variant="caption">{asset.chainTitle}</Type>
                      </span>
                      <span class="flex shrink-0 flex-col items-end">
                        <Type variant="body">{asset.balance}</Type>
                        <Show when={asset.fiatLabel}>
                          {(fiat) => <Type variant="caption">{fiat()}</Type>}
                        </Show>
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>

          <TextField
            value={recipient()}
            onChange={setRecipient}
            validationState={view().showRecipientError ? "invalid" : "valid"}
          >
            <TextFieldLabel>Recipient</TextFieldLabel>
            <TextFieldInput
              placeholder="0x…"
              disabled={view().pending}
              autocomplete="off"
              spellcheck={false}
            />
            <Show when={view().showRecipientError}>
              <TextFieldErrorMessage>{view().recipientError}</TextFieldErrorMessage>
            </Show>
          </TextField>

          <TextField
            value={amount()}
            onChange={setAmount}
            validationState={view().showAmountError ? "invalid" : "valid"}
          >
            <TextFieldLabel>Amount</TextFieldLabel>
            <TextFieldInput
              placeholder="0.0"
              inputmode="decimal"
              disabled={view().pending}
            />
            <Show when={view().maxAmount}>
              {(max) => (
                <TextFieldDescription>
                  Available: {max()} {view().selectedAsset?.token.symbol}
                </TextFieldDescription>
              )}
            </Show>
            <Show when={view().showAmountError}>
              <TextFieldErrorMessage>{view().amountError}</TextFieldErrorMessage>
            </Show>
          </TextField>

          <Show when={view().feeLabel}>
            {(fee) => <Type variant="caption">Network fee: {fee()}</Type>}
          </Show>
          <Show when={view().errorMessage}>
            {(message) => <Type variant="caption" class="text-destructive">{message()}</Type>}
          </Show>
          <Show when={view().statusMessage}>
            {(message) => (
              <Type variant="caption">
                {message()} <Show when={view().txHashLabel}>{(hash) => <>({hash()})</>}</Show>
              </Type>
            )}
          </Show>
        </Show>

        <SheetFooter>
          <Button
            class="w-full"
            disabled={!view().canSubmit}
            loading={view().pending}
            onClick={confirm}
          >
            {view().pending ? "Sending…" : "Review and send"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
