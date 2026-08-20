import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import {
  Button,
  cn,
  IconCheckCircle,
  IconWarningCircle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Spinner,
  TextField,
  TextFieldDescription,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
  Type,
} from "../../design-system";
import {
  buildWalletSendSheetView,
  resolveSendAsset,
  sendAssetId,
  type WalletSendFormState,
} from "./wallet-send-sheet-view-model";
import { getSendableAssets } from "./wallet-send-sheet-model";
import type { WalletSendSheetProps } from "./wallet-send-sheet.types";
import { TokenChainIcon } from "./wallet-visuals";

export function WalletSendSheet(props: WalletSendSheetProps) {
  const defaultAsset = createMemo(() => {
    const assets = getSendableAssets(
      props.chainSections.filter((section) => section.availability === "ready"),
    );
    return resolveSendAsset(assets, props.defaultAssetId) ?? assets[0] ?? null;
  });
  const [assetId, setAssetId] = createSignal<string | undefined>(props.defaultAssetId, { ownedWrite: true });
  const [recipient, setRecipient] = createSignal(props.defaultRecipient ?? "", { ownedWrite: true });
  const [amount, setAmount] = createSignal(props.amount ?? "", { ownedWrite: true });
  const [submitAttempted, setSubmitAttempted] = createSignal(false, { ownedWrite: true });
  const [localStep, setLocalStep] = createSignal<WalletSendSheetProps["step"]>(undefined, { ownedWrite: true });

  createEffect(
    () => ({
      amount: props.amount,
      defaultAsset: defaultAsset(),
      open: props.open,
      recipient: props.defaultRecipient,
      step: props.step,
    }),
    (next) => {
      if (!next.open) return;
      setAssetId(next.defaultAsset ? sendAssetId(next.defaultAsset) : undefined);
      setRecipient(next.recipient ?? "");
      setAmount(next.amount ?? "");
      setSubmitAttempted(false);
      setLocalStep(undefined);
    },
  );

  const form = (): WalletSendFormState => ({
    assetId: assetId(),
    recipient: recipient(),
    amount: amount(),
    submitAttempted: submitAttempted(),
  });
  const view = createMemo(() => buildWalletSendSheetView({ ...props, step: localStep() ?? props.step }, form()));
  const terminal = () => view().pending || Boolean(view().errorMessage) || Boolean(view().statusMessage);

  const confirm = () => {
    setSubmitAttempted(true);
    if (!view().submit()) return;
    if (!props.onConfirm) setLocalStep("pending");
  };

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side={props.forceMobile ? "bottom" : "right"}
        class="flex max-h-[88dvh] min-h-0 flex-col overflow-y-auto"
        aria-label="Send tokens"
      >
        <SheetHeader>
          <SheetTitle>Send</SheetTitle>
          <SheetDescription>Choose an asset, enter a recipient, and confirm the amount.</SheetDescription>
        </SheetHeader>

        <Show when={!terminal()}>
          <Show
            when={view().hasAssets}
            fallback={<Type variant="caption">No assets with a positive balance to send.</Type>}
          >
            <div class="flex flex-col gap-2">
              <Type variant="overline">Asset</Type>
              <ul class="flex max-h-48 flex-col gap-1 overflow-y-auto" aria-label="Assets" tabindex={0}>
                <For each={view().assets}>
                  {(asset) => (
                    <li>
                      <button
                        type="button"
                        aria-label={`Select ${asset.symbol} on ${asset.chainTitle}`}
                        class={cn(
                          "flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2 text-start transition-colors",
                          asset.selected ? "bg-primary-subtle text-primary-text" : "hover:bg-muted",
                        )}
                        aria-pressed={asset.selected ? "true" : "false"}
                        disabled={view().pending}
                        onClick={() => setAssetId(asset.id)}
                      >
                        <span class="flex min-w-0 items-center gap-3">
                          <TokenChainIcon chainId={asset.chainId} chainLabel={asset.chainTitle} showChainBadge size="sm" token={{ name: asset.symbol, symbol: asset.symbol }} />
                          <span class="flex min-w-0 flex-col">
                            <Type variant="body-strong">{asset.symbol}</Type>
                            <Type variant="caption">{asset.chainTitle}</Type>
                          </span>
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
          </Show>
        </Show>

        <Show when={view().pending}>
          <div aria-live="polite" class="grid justify-items-center gap-3 py-8 text-center" role="status">
            <Spinner aria-hidden="true" class="size-8 text-muted-foreground" />
            <Type as="p" variant="body-strong">Sending transaction…</Type>
          </div>
        </Show>

        <Show when={view().statusMessage}>
          <div aria-live="polite" class="grid justify-items-center gap-3 py-8 text-center" role="status">
            <IconCheckCircle aria-hidden="true" class="size-10 text-success" />
            <Type as="p" variant="body-strong">{view().statusMessage}</Type>
            <Show when={view().txHashLabel}>
              {(hash) => <Type as="p" class="max-w-full truncate text-muted-foreground" variant="body">{hash()}</Type>}
            </Show>
            <Button onClick={() => props.onOpenChange(false)}>Close send sheet</Button>
          </div>
        </Show>

        <Show when={view().errorMessage}>
          {(message) => (
            <div aria-live="assertive" class="grid justify-items-center gap-3 py-8 text-center" role="alert">
              <IconWarningCircle aria-hidden="true" class="size-10 text-warning" />
              <Type as="p" variant="body-strong">{message()}</Type>
              <Button onClick={() => { setLocalStep("asset"); setSubmitAttempted(false); }} variant="secondary">Try again</Button>
            </div>
          )}
        </Show>

        <Show when={!terminal()}>
          <SheetFooter>
            <Button
              class="w-full"
              disabled={!view().canSubmit}
              loading={view().pending}
              onClick={confirm}
            >
              Review and send
            </Button>
          </SheetFooter>
        </Show>
      </SheetContent>
    </Sheet>
  );
}
