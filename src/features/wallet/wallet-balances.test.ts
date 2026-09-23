import { createRoot, createSignal } from "solid-js";
import { expect, test, vi } from "vitest";
import { createWalletBalances, type SelectedWallet } from "./wallet-balances";
import { walletAssetSections, type WalletNetworkMode } from "./wallet-network-catalog";
import type { WalletHubChainSection } from "./wallet-hub.types";

test("persona, network and sign-out changes abort and fence old balances", async () => {
  const pending: { address: string; mode: WalletNetworkMode; signal: AbortSignal; resolve: (rows: WalletHubChainSection[]) => void }[] = [];
  const [selected, setSelected] = createSignal<SelectedWallet | undefined>({ accountId: "account", personaId: "harbor", address: "0x1111111111111111111111111111111111111111" });
  const [mode, setMode] = createSignal<WalletNetworkMode>("mainnet");
  let dispose = () => {};
  const state = createRoot(cleanup => { dispose = cleanup; return createWalletBalances(selected, mode, (address, network, signal) => new Promise(resolve => pending.push({ address, mode: network, signal, resolve }))); });
  try {
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    setSelected({ accountId: "account", personaId: "night", address: "0x2222222222222222222222222222222222222222" });
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0]!.signal.aborted).toBe(true);
    pending[1]!.resolve(walletAssetSections(pending[1]!.address, "mainnet", "25"));
    await vi.waitFor(() => expect(state.sections()[0]!.tokens[0]!.balance).toBe("25"));
    pending[0]!.resolve(walletAssetSections(pending[0]!.address, "mainnet", "999"));
    await Promise.resolve();
    expect(state.sections()[0]!.tokens[0]!.balance).toBe("25");
    setMode("testnet");
    await vi.waitFor(() => expect(pending).toHaveLength(3));
    expect(state.sections()[0]!.title).toBe("Ethereum Sepolia");
    expect(state.sections()[0]!.tokens[0]!.balance).toBe("Loading…");
    setSelected(undefined);
    await vi.waitFor(() => expect(pending[2]!.signal.aborted).toBe(true));
    pending[2]!.resolve(walletAssetSections(pending[2]!.address, "testnet", "800"));
    await Promise.resolve();
    expect(state.sections().every(section => section.walletAddress === null)).toBe(true);
    expect(state.sections()[0]!.tokens[0]!.balance).toBe("Unavailable");
  } finally { dispose(); }
});
