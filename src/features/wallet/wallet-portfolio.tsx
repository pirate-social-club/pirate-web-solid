import { For, Show } from "solid-js";
import { Avatar, Button, Card, CardContent, CardHeader, Type } from "../../design-system";
import { WalletHub } from "./wallet-hub.tsx";
import { WalletReceiveSheet } from "./wallet-receive-sheet.tsx";
import { type PersonaWallet } from "./wallet-portfolio-model.ts";

import { walletAssetSections, type WalletNetworkMode } from "./wallet-network-catalog.ts";
import type { WalletHubChainSection } from "./wallet-hub.types.ts";

export interface WalletPortfolioProps {
  chainSections?: WalletHubChainSection[];
  balancesLoading?: boolean;
  onRefresh?: () => void;
  networkMode?: WalletNetworkMode;
  onNetworkModeChange?: (mode: WalletNetworkMode) => void;
  wallets: readonly PersonaWallet[];
  selectedPersonaId?: string;
  onSelect: (personaId: string) => void;
  onChangeProfile: () => void;
}

/** Private account portfolio. Receive always names one selected persona address. */
export function WalletPortfolio(props: WalletPortfolioProps) {
  const selected = () => props.wallets.find(wallet => wallet.personaId === props.selectedPersonaId);
  const sections = () => props.chainSections ?? walletAssetSections(selected()?.address ?? null, props.networkMode ?? "mainnet");
  return <div class="mx-auto flex w-full max-w-2xl flex-col gap-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex gap-2" role="group" aria-label="Wallet networks">
        <Button size="sm" disabled={!props.onNetworkModeChange} variant={(props.networkMode ?? "mainnet") === "mainnet" ? "secondary" : "ghost"} aria-pressed={(props.networkMode ?? "mainnet") === "mainnet" ? "true" : "false"} onClick={() => props.onNetworkModeChange?.("mainnet")}>Mainnet</Button>
        <Button size="sm" disabled={!props.onNetworkModeChange} variant={props.networkMode === "testnet" ? "secondary" : "ghost"} aria-pressed={props.networkMode === "testnet" ? "true" : "false"} onClick={() => props.onNetworkModeChange?.("testnet")}>Testnet</Button>
      </div>
      <Show when={props.onRefresh}><Button size="sm" variant="outline" disabled={props.balancesLoading || !selected()?.address} onClick={props.onRefresh}>{props.balancesLoading ? "Refreshing…" : "Refresh balances"}</Button></Show>
    </div>
    <Show when={props.networkMode === "testnet"}><Type>Testnet tokens have no monetary value.</Type></Show>
    <Show when={selected()} fallback={<Type>Choose a profile to view its wallet.</Type>}>
      {(wallet) => <WalletHub walletLabel={wallet().displayName} walletAddress={wallet().address}
        assetsUnavailable totalBalanceUsd={null} changeWalletLabel="Switch profile" onChangeWallet={props.onChangeProfile}
        chainSections={sections()}
        renderReceiveSheet={wallet().address ? controls => <WalletReceiveSheet {...controls} chainSections={sections()} walletAddress={wallet().address} /> : undefined}
      />}
    </Show>
    <Card>
      <CardHeader><Type as="h2" variant="h3">Your wallets</Type></CardHeader>
      <CardContent>
        <Show when={props.wallets.length > 0} fallback={<Type>No active profile wallets yet.</Type>}>
          <ul class="divide-y divide-border-soft"><For each={props.wallets}>{wallet => <li>
            <button type="button" aria-pressed={wallet.personaId === props.selectedPersonaId ? "true" : "false"} onClick={() => props.onSelect(wallet.personaId)} class="flex w-full cursor-pointer items-center gap-3 rounded-lg p-3 text-start hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar fallback={wallet.displayName} src={wallet.avatarSrc ?? undefined} fallbackSeed={wallet.displayName} />
              <span class="min-w-0 flex-1"><Type as="span" variant="body-strong" class="block truncate">{wallet.displayName}</Type><Type as="span" variant="caption" class="block break-all">{wallet.address ?? "Wallet unavailable"}</Type></span>
              <Show when={wallet.personaId === props.selectedPersonaId}><Type as="span" variant="caption">Selected</Type></Show>
            </button>
          </li>}</For></ul>
        </Show>
      </CardContent>
    </Card>
  </div>;
}
