import { createMemo, createSignal, For, Show } from "solid-js";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  IconArrowDown,
  IconArrowUp,
  IconWallet,
  Separator,
  Type,
} from "../../design-system";
import { buildWalletHubView } from "./wallet-hub-view-model";
import type { WalletHubAssetRow } from "./wallet-hub-model";
import type { WalletHubProps } from "./wallet-hub.types";
import { TokenChainIcon } from "./wallet-visuals";

function AssetRow(props: { asset: WalletHubAssetRow }) {
  return (
    <li class="flex items-center gap-3 border-b border-border-soft px-1 py-3 last:border-b-0">
      <TokenChainIcon asset={props.asset} />
      <div class="min-w-0 flex-1">
        <Type as="div" variant="body-strong">{props.asset.symbol}</Type>
      </div>
      <div class="min-w-[5.5rem] shrink-0 text-end">
        <Type as="div" variant="body" class="tabular-nums">{props.asset.balance}</Type>
        <Type as="div" variant="caption" class="tabular-nums">{props.asset.fiatValue ?? "$0.00"}</Type>
      </div>
    </li>
  );
}

export function WalletHub(props: WalletHubProps) {
  const view = createMemo(() => buildWalletHubView(props));
  const [receiveOpen, setReceiveOpen] = createSignal(false);
  const [sendOpen, setSendOpen] = createSignal(false);

  const openReceive = () => {
    if (props.renderReceiveSheet) setReceiveOpen(true);
    view().actions.receive.onSelect?.();
  };
  const openSend = () => {
    if (props.renderSendSheet) setSendOpen(true);
    view().actions.send.onSelect?.();
  };
  const receiveSheet = createMemo(() => props.renderReceiveSheet?.({ open: receiveOpen(), onOpenChange: setReceiveOpen }));
  const sendSheet = createMemo(() => props.renderSendSheet?.({ open: sendOpen(), onOpenChange: setSendOpen }));

  return (
    <div
      class="mx-auto flex w-full max-w-2xl flex-col gap-4"
      data-variant={props.variant ?? "route"}
      data-wallet-hub
    >
      <header class="flex items-center justify-between gap-3">
        <Type variant="h2" as="h1">{view().title}</Type>
        <div class="flex items-center gap-2">
          <Show when={view().walletLabel}>
            {(walletLabel) => (
              <span class="inline-flex items-center gap-1.5 text-base text-muted-foreground">
                <IconWallet class="size-[18px]" />
                {walletLabel()}
              </span>
            )}
          </Show>
          <Show when={props.onChangeWallet || props.walletActionsPending}>
            <Button
              variant="ghost"
              size="sm"
              disabled={view().actions.changeWallet.disabled}
              loading={view().actions.changeWallet.pending}
              onClick={() => view().actions.changeWallet.onSelect?.()}
            >
              {view().actions.changeWallet.label}
            </Button>
          </Show>
        </div>
      </header>

      <Card>
        <CardHeader>
          <Type variant="overline">Total balance</Type>
          <Type variant="h1" as="p">
            {view().totalBalanceLabel ?? "—"}
          </Type>
        </CardHeader>
        <CardContent class="flex gap-3">
          <Button
            class="flex-1"
            leadingIcon={<IconArrowDown class="size-[18px]" />}
            disabled={view().actions.receive.disabled}
            onClick={openReceive}
          >
            {view().actions.receive.label}
          </Button>
          <Button
            class="flex-1"
            variant="outline"
            leadingIcon={<IconArrowUp class="size-[18px]" />}
            disabled={view().actions.send.disabled}
            onClick={openSend}
          >
            {view().actions.send.label}
          </Button>
        </CardContent>
      </Card>

      <div class="grid gap-4 md:grid-cols-2">
        <Show when={view().claim}>
          {(claim) => (
            <Card>
              <CardContent class="flex flex-col justify-center gap-3 p-6">
                <Type variant="overline">Royalties</Type>
                <Type variant="h1" as="p">{claim().amountLabel}</Type>
                <Button
                  disabled={claim().action.disabled}
                  loading={claim().action.pending}
                  onClick={() => claim().action.onSelect?.()}
                >
                  {claim().action.label}
                </Button>
              </CardContent>
            </Card>
          )}
        </Show>

        <Show when={view().rewards}>
          {(rewards) => (
            <Card>
              <CardContent class="flex flex-col justify-center gap-3 p-6">
                <Type variant="overline">Rewards</Type>
                <Type variant="h1" as="p">{rewards().amountLabel}</Type>
                <Show when={rewards().action}>
                  {(action) => (
                    <Button
                      variant="secondary"
                      disabled={action().disabled}
                      loading={action().pending}
                      onClick={() => action().onSelect?.()}
                    >
                      {action().label}
                    </Button>
                  )}
                </Show>
              </CardContent>
            </Card>
          )}
        </Show>
      </div>

      <Card>
        <CardHeader class="flex-row items-center justify-between space-y-0">
          <Type as="h2" variant="h3">Assets</Type>
        </CardHeader>
        <CardContent class="p-4 pt-0">
          <Show
            when={view().assetRows.length > 0}
            fallback={
              <Type variant="caption">
                {view().connected ? "No assets yet." : "Connect a wallet to see your assets."}
              </Type>
            }
          >
            <ul class="flex flex-col">
              <For each={view().assetRows}>{(asset) => <AssetRow asset={asset} />}</For>
            </ul>
          </Show>
        </CardContent>
      </Card>

      <Show when={view().recentActivity.length > 0}>
        <Card>
          <CardHeader>
            <Type as="h2" variant="h3">Recent activity</Type>
          </CardHeader>
          <CardContent>
            <ul class="flex flex-col">
              <For each={view().recentActivity}>
                {(item, index) => (
                  <li>
                    <Show when={index() > 0}>
                      <Separator />
                    </Show>
                    <div class="flex items-center justify-between gap-3 py-3">
                      <div class="flex min-w-0 flex-col">
                        <Type variant="body">{item.title}</Type>
                        <Show when={item.timestamp}>
                          {(timestamp) => <Type variant="caption">{timestamp()}</Type>}
                        </Show>
                      </div>
                      <Type variant="body-strong" class="shrink-0">{item.amount}</Type>
                    </div>
                  </li>
                )}
              </For>
            </ul>
          </CardContent>
        </Card>
      </Show>

      {receiveSheet()}
      {sendSheet()}
    </div>
  );
}
