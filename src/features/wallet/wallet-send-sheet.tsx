import type { JSX } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import {
  Button,
  IconArrowLeft,
  IconCheck,
  IconCheckCircle,
  IconMagnifyingGlass,
  IconButton,
  IconWarningCircle,
  Input,
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
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
  type WalletSendAssetOption,
  type WalletSendFormState,
} from "./wallet-send-sheet-view-model";
import { formatShortAddress, getSendableAssets } from "./wallet-send-sheet-model";
import type { WalletSendSheetProps } from "./wallet-send-sheet.types";
import { TokenChainIcon } from "./wallet-visuals";

type AssetGroup = {
  assets: WalletSendAssetOption[];
  chainId: string;
  chainTitle: string;
};

function SummaryRow(props: { label: string; value: JSX.Element }) {
  return (
    <div class="flex items-center justify-between gap-4 border-b border-border-soft py-3 last:border-b-0">
      <Type as="div" variant="body" class="text-muted-foreground">{props.label}</Type>
      <Type as="div" variant="body-strong" class="min-w-0 truncate text-end">{props.value}</Type>
    </div>
  );
}

export function WalletSendSheet(props: WalletSendSheetProps) {
  const defaultAsset = createMemo(() => {
    const assets = getSendableAssets(
      props.chainSections.filter((section) => section.availability === "ready"),
    );
    return resolveSendAsset(assets, props.defaultAssetId) ?? assets[0] ?? null;
  });
  const [assetId, setAssetId] = createSignal<string | undefined>(props.defaultAssetId, { ownedWrite: true });
  const [assetQuery, setAssetQuery] = createSignal("");
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
      setAssetQuery("");
      setRecipient(next.recipient ?? "");
      setAmount(next.amount ?? "");
      setSubmitAttempted(false);
      setLocalStep(next.step ?? "asset");
    },
  );

  const activeStep = () => localStep() ?? props.step ?? "asset";
  const form = (): WalletSendFormState => ({
    assetId: assetId(),
    recipient: recipient(),
    amount: amount(),
    submitAttempted: submitAttempted(),
  });
  const view = createMemo(() =>
    buildWalletSendSheetView({ ...props, step: activeStep() }, form()),
  );
  const filteredAssets = createMemo(() => {
    const query = assetQuery().trim().toLowerCase();
    if (!query) return view().assets;
    return view().assets.filter((asset) =>
      `${asset.symbol} ${asset.chainTitle}`.toLowerCase().includes(query),
    );
  });
  const assetGroups = createMemo<AssetGroup[]>(() => {
    const groups = new Map<string, AssetGroup>();
    for (const asset of filteredAssets()) {
      const existing = groups.get(asset.chainId);
      if (existing) existing.assets.push(asset);
      else groups.set(asset.chainId, { assets: [asset], chainId: asset.chainId, chainTitle: asset.chainTitle });
    }
    return [...groups.values()];
  });
  const terminal = () => view().pending || Boolean(view().errorMessage) || Boolean(view().statusMessage);

  const selectAsset = (nextAsset: WalletSendAssetOption) => {
    setAssetId(nextAsset.id);
    setSubmitAttempted(false);
    setLocalStep("recipient");
  };

  const continueToAmount = () => {
    setSubmitAttempted(true);
    if (view().recipientError !== null) return;
    setSubmitAttempted(false);
    setLocalStep("amount");
  };

  const continueToReview = () => {
    setSubmitAttempted(true);
    if (view().amountError !== null) return;
    setSubmitAttempted(false);
    setLocalStep("review");
  };

  const confirm = () => {
    setSubmitAttempted(true);
    if (!view().submit()) return;
    if (!props.onConfirm) setLocalStep("pending");
  };

  return (
    <Modal forceMobile={props.forceMobile} open={props.open} onOpenChange={props.onOpenChange}>
      <ModalContent
        mobileSide="bottom"
        class="flex max-h-[88dvh] min-h-0 w-full flex-col overflow-y-auto rounded-t-[var(--radius-3xl)] border-x-0 border-b-0 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 md:w-[min(100%-2rem,38rem)] md:max-w-[38rem] md:rounded-[var(--radius-xl)] md:border md:p-7"
      >
        <div class="mx-auto mb-4 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/60 md:hidden" aria-hidden="true" />
        <ModalHeader class="pe-10 text-start">
          <Show when={activeStep() === "asset"}>
            <ModalTitle>Send</ModalTitle>
            <ModalDescription>Choose an asset and network first.</ModalDescription>
          </Show>
          <Show when={activeStep() === "recipient"}>
            <div class="flex items-center gap-2">
              <IconButton aria-label="Back" class="size-10 shrink-0" onClick={() => setLocalStep("asset")} title="Back" variant="ghost">
                <IconArrowLeft class="size-5" />
              </IconButton>
              <div class="min-w-0">
                <ModalTitle>Recipient</ModalTitle>
                <ModalDescription class="truncate">Send {view().selectedAsset?.token.symbol} on {view().selectedAsset?.chainTitle}</ModalDescription>
              </div>
            </div>
          </Show>
          <Show when={activeStep() === "amount"}>
            <div class="flex items-center gap-2">
              <IconButton aria-label="Back" class="size-10 shrink-0" onClick={() => setLocalStep("recipient")} title="Back" variant="ghost">
                <IconArrowLeft class="size-5" />
              </IconButton>
              <div class="min-w-0">
                <ModalTitle>Amount</ModalTitle>
                <ModalDescription class="truncate">Send {view().selectedAsset?.token.symbol} on {view().selectedAsset?.chainTitle}</ModalDescription>
              </div>
            </div>
          </Show>
          <Show when={activeStep() === "review"}>
            <div class="flex items-center gap-2">
              <IconButton aria-label="Back" class="size-10 shrink-0" onClick={() => setLocalStep("amount")} title="Back" variant="ghost">
                <IconArrowLeft class="size-5" />
              </IconButton>
              <div class="min-w-0">
                <ModalTitle>Review</ModalTitle>
                <ModalDescription>Check the details before sending.</ModalDescription>
              </div>
            </div>
          </Show>
          <Show when={activeStep() === "pending"}><ModalTitle>Sending</ModalTitle></Show>
          <Show when={activeStep() === "success"}><ModalTitle>Complete</ModalTitle></Show>
          <Show when={activeStep() === "error"}><ModalTitle>Failed</ModalTitle></Show>
        </ModalHeader>

        <Show when={!terminal()}>
          <Show when={activeStep() === "asset" && view().hasAssets}>
            <div class="mt-6 grid gap-4">
              <div class="relative">
                <IconMagnifyingGlass aria-hidden="true" class="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                <Input aria-label="Search assets" class="ps-11" onInput={(event) => setAssetQuery(event.currentTarget.value)} placeholder="Search assets" value={assetQuery()} />
              </div>
              <div class="grid max-h-[min(48dvh,24rem)] gap-5 overflow-y-auto" tabindex={0}>
                <For each={assetGroups()}>
                  {(group) => (
                    <section>
                      <Type as="h3" variant="caption" class="mb-2 px-1 text-muted-foreground">{group.chainTitle}</Type>
                      <div class="overflow-hidden rounded-[var(--radius-md)] border border-border-soft">
                        <For each={group.assets}>
                          {(asset) => (
                            <button
                              type="button"
                              aria-label={`Select ${asset.symbol} on ${asset.chainTitle}`}
                              aria-pressed={asset.selected ? "true" : "false"}
                              class={`flex min-h-16 w-full items-center gap-3 border-b border-border-soft px-4 py-3 text-start transition-colors last:border-b-0 hover:bg-muted/35 ${asset.selected ? "bg-primary-subtle text-primary-text" : ""}`}
                              disabled={view().pending}
                              onClick={() => selectAsset(asset)}
                            >
                              <TokenChainIcon asset={asset} />
                              <div class="min-w-0 flex-1">
                                <Type as="div" variant="body-strong">{asset.symbol}</Type>
                                <Type as="div" variant="caption" class="truncate text-muted-foreground">{asset.balance} {asset.symbol}</Type>
                              </div>
                              <div class="text-end">
                                <Type as="div" variant="body-strong" class="tabular-nums">{asset.fiatLabel ?? "$0.00"}</Type>
                                <Show when={asset.selected}><IconCheck aria-hidden="true" class="ms-auto mt-1 size-4" /></Show>
                              </div>
                            </button>
                          )}
                        </For>
                      </div>
                    </section>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Show when={activeStep() === "asset" && !view().hasAssets}>
            <Type as="p" variant="body" class="mt-6 text-muted-foreground">No assets with a positive balance to send.</Type>
          </Show>

          <Show when={activeStep() === "recipient" && view().selectedAsset}>
            <div class="mt-6 grid gap-4">
              <TextField value={recipient()} onChange={setRecipient} validationState={view().showRecipientError ? "invalid" : "valid"}>
                <TextFieldLabel>Recipient</TextFieldLabel>
                <TextFieldInput autocomplete="off" disabled={view().pending} placeholder="0x…" spellcheck={false} />
                <Show when={view().showRecipientError}><TextFieldErrorMessage>{view().recipientError}</TextFieldErrorMessage></Show>
              </TextField>
              <ModalFooter class="mt-2">
                <Button class="w-full" onClick={continueToAmount}>Continue</Button>
              </ModalFooter>
            </div>
          </Show>

          <Show when={activeStep() === "amount" && view().selectedAsset}>
            <div class="mt-6 grid gap-4">
              <TextField value={amount()} onChange={setAmount} validationState={view().showAmountError ? "invalid" : "valid"}>
                <TextFieldLabel>Amount</TextFieldLabel>
                <TextFieldInput disabled={view().pending} inputmode="decimal" placeholder="0.00" />
                <Show when={view().maxAmount}>
                  {(max) => <TextFieldDescription>Available: {max()} {view().selectedAsset?.token.symbol}</TextFieldDescription>}
                </Show>
                <Show when={view().showAmountError}><TextFieldErrorMessage>{view().amountError}</TextFieldErrorMessage></Show>
              </TextField>
              <Show when={view().feeLabel}><Type variant="caption">Network fee: {view().feeLabel}</Type></Show>
              <Button class="w-full" onClick={() => setAmount(view().selectedAsset?.token.balance ?? "0")} variant="secondary">Max</Button>
              <ModalFooter class="mt-2">
                <Button class="w-full" onClick={continueToReview}>Review</Button>
              </ModalFooter>
            </div>
          </Show>

          <Show when={activeStep() === "review" && view().selectedAsset}>
            <div class="mt-6">
              <div class="rounded-[var(--radius-md)] border border-border-soft px-4">
                <SummaryRow label="Asset" value={view().selectedAsset!.token.symbol} />
                <SummaryRow label="Amount" value={`${amount()} ${view().selectedAsset!.token.symbol}`} />
                <SummaryRow label="Network" value={view().selectedAsset!.chainTitle} />
                <SummaryRow label="Recipient" value={formatShortAddress(recipient())} />
                <SummaryRow label="Fee" value={view().feeLabel ?? "$0.00"} />
              </div>
              <ModalFooter class="mt-6">
                <Button class="w-full" onClick={confirm}>Send</Button>
              </ModalFooter>
            </div>
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
            <Show when={view().txHashLabel}>{(hash) => <Type as="p" class="max-w-full truncate text-muted-foreground" variant="body">{hash()}</Type>}</Show>
            <Button onClick={() => props.onOpenChange(false)}>Close</Button>
          </div>
        </Show>

        <Show when={view().errorMessage}>
          {(message) => (
            <div aria-live="assertive" class="grid justify-items-center gap-3 py-8 text-center" role="alert">
              <IconWarningCircle aria-hidden="true" class="size-10 text-warning" />
              <Type as="p" variant="body-strong">{message()}</Type>
              <Button onClick={() => { setLocalStep("asset"); setSubmitAttempted(false); }} variant="secondary">Retry</Button>
            </div>
          )}
        </Show>
      </ModalContent>
    </Modal>
  );
}
