import { createMemo, createSignal, For, Show } from "solid-js";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  IconArrowDown,
  IconArrowUp,
  IconWallet,
  Separator,
  Type,
} from "../../design-system";
import { buildWalletHubView } from "./wallet-hub-view-model";
import type { WalletHubChainSection, WalletHubProps } from "./wallet-hub.types";

function ChainSection(props: {
  fiatByTokenId: Record<string, string | null>;
  section: WalletHubChainSection;
}) {
  return (
    <section aria-label={props.section.title} class="flex flex-col gap-2">
      <div class="flex items-baseline justify-between gap-2">
        <Type variant="overline">{props.section.title}</Type>
        <Show when={props.section.availability === "later"}>
          <Type variant="caption">{props.section.note ?? "Available later"}</Type>
        </Show>
      </div>
      <Show when={props.section.availability === "ready"}>
        <ul class="flex flex-col divide-y divide-border-soft">
          <For each={props.section.tokens}>
            {(token) => {
              const fiatValue = () => props.fiatByTokenId[`${props.section.chainId}:${token.id}`];
              return (
                <li class="flex items-center justify-between gap-3 py-3">
                  <div class="flex min-w-0 flex-col">
                    <Type variant="body-strong">{token.symbol}</Type>
                    <Type variant="caption" class="truncate">{token.name}</Type>
                  </div>
                  <div class="flex shrink-0 flex-col items-end">
                    <Type variant="body-strong">{token.balance ?? "0"}</Type>
                    <Show when={fiatValue()}>
                      {(value) => <Type variant="caption">{value()}</Type>}
                    </Show>
                  </div>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>
    </section>
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

  return (
    <div
      class="mx-auto flex w-full max-w-2xl flex-col gap-4"
      data-variant={props.variant ?? "route"}
      data-wallet-hub
    >
      <header class="flex items-center justify-between gap-3">
        <Type variant="h2" as="h1">{view().title}</Type>
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center gap-1.5 text-base text-muted-foreground">
            <IconWallet class="size-[18px]" />
            {view().walletLabel}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={view().actions.changeWallet.disabled}
            loading={view().actions.changeWallet.pending}
            onClick={() => view().actions.changeWallet.onSelect?.()}
          >
            {view().actions.changeWallet.label}
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <Type variant="overline">Total balance</Type>
          <Type variant="display" as="p">
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

      <Show when={view().claim}>
        {(claim) => (
          <Card>
            <CardContent class="flex items-center justify-between gap-3 p-6">
              <div class="flex min-w-0 flex-col">
                <Type variant="overline">Claimable royalties</Type>
                <Type variant="body-strong">{claim().amountLabel}</Type>
                <Show when={claim().supportingLabel}>
                  {(supporting) => <Type variant="caption">{supporting()}</Type>}
                </Show>
              </div>
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
            <CardContent class="flex items-center justify-between gap-3 p-6">
              <div class="flex min-w-0 flex-col">
                <Type variant="overline">Rewards</Type>
                <Type variant="body-strong">
                  {rewards().amountLabel} {rewards().assetLabel}
                </Type>
                <Show when={rewards().supportingLabel}>
                  {(supporting) => <Type variant="caption">{supporting()}</Type>}
                </Show>
              </div>
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

      <Card>
        <CardHeader>
          <CardTitle>Assets</CardTitle>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <Show
            when={!view().isEmpty}
            fallback={
              <Type variant="caption">
                {view().connected
                  ? "No assets yet. Receive tokens to get started."
                  : "Connect a wallet to see your assets."}
              </Type>
            }
          >
            <For each={view().readySections}>
              {(section) => <ChainSection section={section} fiatByTokenId={view().fiatByTokenId} />}
            </For>
          </Show>
          <For each={view().laterSections}>
            {(section) => <ChainSection section={section} fiatByTokenId={view().fiatByTokenId} />}
          </For>
        </CardContent>
      </Card>

      <Show when={view().recentActivity.length > 0}>
        <Card>
          <CardHeader class="flex-row items-center justify-between space-y-0">
            <CardTitle>Recent activity</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              disabled={view().actions.viewActivity.disabled}
              onClick={() => view().actions.viewActivity.onSelect?.()}
            >
              {view().actions.viewActivity.label}
            </Button>
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

      <Show when={props.renderReceiveSheet}>
        {(render) => render()({ open: receiveOpen(), onOpenChange: setReceiveOpen })}
      </Show>
      <Show when={props.renderSendSheet}>
        {(render) => render()({ open: sendOpen(), onOpenChange: setSendOpen })}
      </Show>
    </div>
  );
}
