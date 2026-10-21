import { createEffect, createSignal, onCleanup, untrack, type Accessor } from "solid-js";
import { walletAssetSections, type WalletNetworkMode } from "./wallet-network-catalog";
import type { WalletBalanceReader } from "./wallet-balance-reader";
import type { WalletHubChainSection } from "./wallet-hub.types";

export interface SelectedWallet { accountId: string; personaId: string; address: string; }
export function createWalletBalances(selected: Accessor<SelectedWallet | undefined>, mode: Accessor<WalletNetworkMode>, read: WalletBalanceReader) {
  const key = () => { const wallet = selected(); return wallet ? JSON.stringify([wallet.accountId, wallet.personaId, wallet.address, mode()]) : undefined; };
  const [owner, setOwner] = createSignal<string>();
  const [sections, setSections] = createSignal<WalletHubChainSection[]>([]);
  const [loading, setLoading] = createSignal(false);
  let controller: AbortController | undefined;
  let generation = 0;
  let scopeGeneration = 0;
  let active = true;
  const reload = () => {
    if (!active) return;
    controller?.abort();
    const request = ++generation;
    const wallet = untrack(selected);
    const network = untrack(mode);
    const identity = untrack(key);
    setOwner(identity);
    setSections(walletAssetSections(wallet?.address ?? null, network, wallet ? "Loading…" : "Unavailable"));
    setLoading(Boolean(wallet));
    if (!wallet) return;
    controller = new AbortController();
    void read(wallet.address, network, controller.signal).then(result => {
      if (active && request === generation && identity === key()) setSections(result);
    }).catch(() => {
      if (active && request === generation && identity === key()) setSections(walletAssetSections(wallet.address, network));
    }).finally(() => { if (active && request === generation) setLoading(false); });
  };
  createEffect(key, () => { scopeGeneration++; reload(); });
  const onReturn = () => { if (document.visibilityState !== "hidden") reload(); };
  if (typeof window !== "undefined") {
    window.addEventListener("focus", onReturn);
    window.addEventListener("pageshow", onReturn);
  }
  onCleanup(() => {
    active = false; generation++; scopeGeneration++; controller?.abort();
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("pageshow", onReturn);
    }
  });
  return {
    sections: () => owner() === key() ? sections() : walletAssetSections(selected()?.address ?? null, mode(), selected() ? "Loading…" : "Unavailable"),
    loading, reload,
    /** Freeze the parent identity when an owned send sheet opens. */
    captureReload: () => {
      const identity = untrack(key), scope = scopeGeneration;
      return () => { if (active && identity !== undefined && identity === key() && scope === scopeGeneration) reload(); };
    },
  };
}
