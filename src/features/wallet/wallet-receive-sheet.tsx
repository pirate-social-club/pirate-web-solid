import { createMemo, createSignal, For, Show } from "solid-js";

import {
  Button,
  cn,
  IconCheck,
  IconCopy,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Type,
} from "../../design-system";
import { buildWalletReceiveSheetView } from "./wallet-receive-sheet-view-model";
import type { WalletReceiveSheetProps } from "./wallet-receive-sheet.types";
import type { WalletHubChainId } from "./wallet-hub.types";

export function WalletReceiveSheet(props: WalletReceiveSheetProps) {
  const [selectedChainId, setSelectedChainId] = createSignal<WalletHubChainId | undefined>();
  const [copied, setCopied] = createSignal(false);
  const view = createMemo(() => buildWalletReceiveSheetView(props, selectedChainId()));

  const selectChain = (chainId: WalletHubChainId) => {
    setCopied(false);
    setSelectedChainId(chainId);
  };

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
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side={props.forceMobile ? "bottom" : "right"}
        class="flex flex-col"
        aria-label="Receive tokens"
      >
        <SheetHeader>
          <SheetTitle>Receive</SheetTitle>
          <SheetDescription>
            Choose a chain and share your address to receive tokens.
          </SheetDescription>
        </SheetHeader>

        <ul class="flex flex-col gap-1" aria-label="Chains">
          <For each={view().chains}>
            {(chain) => (
              <li>
                <button
                  type="button"
                  class={cn(
                    "flex w-full items-center justify-between gap-3 rounded-[var(--radius-md)] px-3 py-2 text-start transition-colors",
                    chain.selected ? "bg-primary-subtle text-primary-text" : "hover:bg-muted",
                    chain.disabled && "cursor-not-allowed opacity-50",
                  )}
                  disabled={chain.disabled}
                  aria-pressed={chain.selected ? "true" : "false"}
                  onClick={() => selectChain(chain.chainId)}
                >
                  <span class="flex min-w-0 flex-col">
                    <Type variant="body-strong">{chain.title}</Type>
                    <Show when={chain.note}>
                      {(note) => <Type variant="caption">{note()}</Type>}
                    </Show>
                  </span>
                  <Type variant="caption" class="shrink-0">{chain.fiatLabel}</Type>
                </button>
              </li>
            )}
          </For>
        </ul>

        <Show
          when={view().address}
          fallback={
            <Type variant="caption">No address is available for the supported chains yet.</Type>
          }
        >
          <div class="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border-soft p-4">
            <Type variant="overline">{view().selectedTitle} address</Type>
            <Type variant="body" class="break-all">{view().addressLabel}</Type>
            <Button
              variant="outline"
              size="sm"
              class="self-start"
              leadingIcon={copied() ? <IconCheck class="size-4" /> : <IconCopy class="size-4" />}
              onClick={() => void copyAddress()}
            >
              {copied() ? "Copied" : "Copy address"}
            </Button>
          </div>
        </Show>

        <SheetFooter>
          <Button variant="secondary" onClick={() => props.onOpenChange(false)}>Done</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
