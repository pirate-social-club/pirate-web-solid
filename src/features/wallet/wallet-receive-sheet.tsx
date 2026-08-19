import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";

import {
  Button,
  IconCheck,
  IconCopy,
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
  ResponsiveOptionSelect,
  Type,
} from "../../design-system";
import { buildWalletReceiveSheetView, resolveReceiveChainId } from "./wallet-receive-sheet-view-model";
import type { WalletReceiveSheetProps } from "./wallet-receive-sheet.types";
import type { WalletHubChainId } from "./wallet-hub.types";
import { ChainIcon } from "./wallet-visuals";

export function WalletReceiveSheet(props: WalletReceiveSheetProps) {
  const [selectedChainId, setSelectedChainId] = createSignal<WalletHubChainId | undefined>(resolveReceiveChainId(props));
  const [copied, setCopied] = createSignal(false);
  const [qrDataUrl, setQrDataUrl] = createSignal("");

  createEffect(
    () => ({
      chainSections: props.chainSections,
      defaultChainId: props.defaultChainId,
      open: props.open,
      walletAddress: props.walletAddress,
    }),
    (next) => {
      if (!next.open) return;
      setSelectedChainId(resolveReceiveChainId({ ...props, ...next }));
      setCopied(false);
    },
  );

  const view = createMemo(() => buildWalletReceiveSheetView(props, selectedChainId()));
  const receiveChains = createMemo(() => buildWalletReceiveSheetView(props).chains);
  const networkOptions = createMemo(() =>
    receiveChains().map((chain) => ({
      description: chain.fiatLabel,
      disabled: chain.disabled,
      disabledReason: chain.note,
      icon: <ChainIcon chainId={chain.chainId} class="size-8" />,
      label: chain.title,
      value: chain.chainId,
    })),
  );

  const selectChain = (chainId: WalletHubChainId) => {
    setCopied(false);
    setSelectedChainId(chainId);
  };

  createEffect(
    () => ({ address: view().address, chainId: view().selectedChainId }),
    (next) => {
      if (!next.address || !next.chainId) {
        setQrDataUrl("");
        return;
      }

      let active = true;
      setQrDataUrl("");
      void import("qrcode").then(async ({ default: QRCode }) => {
        const dataUrl = await QRCode.toDataURL(`${next.chainId}:${next.address}`, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 240,
        });
        if (active) setQrDataUrl(dataUrl);
      }).catch(() => {
        if (active) setQrDataUrl("");
      });
      onCleanup(() => { active = false; });
    },
  );

  const copyAddress = async () => {
    const address = view().address;
    if (!address || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal forceMobile={props.forceMobile} open={props.open} onOpenChange={props.onOpenChange}>
      <ModalContent
        mobileSide="bottom"
        class="flex max-h-[88dvh] min-h-0 w-full flex-col overflow-y-auto rounded-t-[var(--radius-3xl)] border-x-0 border-b-0 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 md:w-[min(100%-2rem,34rem)] md:max-w-[34rem] md:rounded-[var(--radius-xl)] md:border md:p-7"
      >
        <div class="mx-auto mb-4 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/60 md:hidden" aria-hidden="true" />
        <ModalHeader class="pe-10 text-start">
          <ModalTitle>Receive</ModalTitle>
          <ModalDescription>Choose the network before sharing your wallet address.</ModalDescription>
        </ModalHeader>

        <Show
          when={view().address && view().selectedChainId}
          fallback={
            <div class="mt-6 rounded-[var(--radius-md)] border border-border-soft bg-muted/20 p-5 text-center">
              <Type as="p" variant="body-strong">No wallet connected</Type>
              <Type as="p" variant="body" class="mt-1 text-muted-foreground">Connect a wallet before receiving assets.</Type>
            </div>
          }
        >
          <div class="mt-6 flex flex-col gap-5">
            <div class="flex items-center justify-between gap-4">
              <Type variant="body" class="text-muted-foreground">Network</Type>
              <ResponsiveOptionSelect
                ariaLabel="Receive network"
                class="w-full min-w-0 shrink-0 md:w-60"
                drawerTitle="Receive network"
                onValueChange={(value) => selectChain(value as WalletHubChainId)}
                options={networkOptions()}
                selectAlign="end"
                triggerContent={
                  <span class="flex min-w-0 items-center gap-2">
                    <ChainIcon chainId={view().selectedChainId!} class="size-5" />
                    <span class="truncate">{view().selectedTitle}</span>
                  </span>
                }
                value={view().selectedChainId}
              />
            </div>

            <div class="flex items-center gap-2 rounded-[var(--radius-md)] border border-border-soft bg-muted/20 p-3">
              <Type variant="body" class="min-w-0 flex-1 cursor-text break-all select-all font-mono">{view().address}</Type>
              <Button
                aria-label={copied() ? "Address copied" : "Copy address"}
                class="size-9 shrink-0"
                onClick={() => void copyAddress()}
                size="icon"
                title={copied() ? "Address copied" : "Copy address"}
                variant="outline"
              >
                {copied() ? <IconCheck class="size-4" /> : <IconCopy class="size-4" />}
              </Button>
            </div>

            <div class={`${props.forceMobile ? "hidden" : "hidden md:grid"} mx-auto size-52 place-items-center rounded-[var(--radius-md)] border border-border-soft bg-white p-4`}>
              <Show
                when={qrDataUrl()}
                fallback={<div aria-hidden="true" class="size-full rounded-[var(--radius-sm)] bg-muted/30" />}
              >
                {(qr) => <img alt={`QR code for ${view().selectedTitle}`} class="size-full" src={qr()} />}
              </Show>
            </div>
          </div>
        </Show>
        <Show when={copied()}>
          <Type aria-live="polite" class="sr-only" variant="caption">Address copied</Type>
        </Show>
      </ModalContent>
    </Modal>
  );
}
