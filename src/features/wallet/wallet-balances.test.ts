import { createRoot, createSignal, flush } from "solid-js";
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

function refreshFixture() {
  const original: SelectedWallet = { accountId: "account", personaId: "profile", address: "0x1111111111111111111111111111111111111111" };
  const [selected, setSelected] = createSignal<SelectedWallet | undefined>(original);
  const [mode, setMode] = createSignal<WalletNetworkMode>("mainnet");
  const read = vi.fn(async (address: string, network: WalletNetworkMode) => walletAssetSections(address, network, "25"));
  let dispose = () => {};
  const state = createRoot(cleanup => { dispose = cleanup; return createWalletBalances(selected, mode, read); });
  flush();
  return { original, read, state, dispose, setSelected, setMode };
}

test("returning to the page refreshes balances and disposal removes both listeners", () => {
  const f = refreshFixture();
  try {
    expect(f.read).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("focus"));
    expect(f.read).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event("pageshow"));
    expect(f.read).toHaveBeenCalledTimes(3);
    f.dispose();
    window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("pageshow")); f.state.reload();
    expect(f.read).toHaveBeenCalledTimes(3);
  } finally { f.dispose(); }
});

test.each(["account", "profile", "address", "network"] as const)("a confirmed callback cannot refresh a changed %s", field => {
  const f = refreshFixture();
  try {
    const confirmed = f.state.captureReload();
    if (field === "network") f.setMode("testnet");
    else f.setSelected({ ...f.original,
      ...(field === "account" ? { accountId: "other-account" } : field === "profile" ? { personaId: "other-profile" }
        : { address: "0x2222222222222222222222222222222222222222" }) });
    flush();
    const count = f.read.mock.calls.length;
    confirmed();
    expect(f.read).toHaveBeenCalledTimes(count);
  } finally { f.dispose(); }
});

test("page refresh retains a current confirmation callback; sign-out and return permanently invalidate it", () => {
  const f = refreshFixture();
  try {
    const confirmed = f.state.captureReload();
    f.state.reload(); confirmed();
    expect(f.read).toHaveBeenCalledTimes(3);
    f.setSelected(undefined); flush(); f.setSelected(f.original); flush();
    const count = f.read.mock.calls.length;
    confirmed();
    expect(f.read).toHaveBeenCalledTimes(count);
    const current = f.state.captureReload(); f.dispose(); current();
    expect(f.read).toHaveBeenCalledTimes(count);
  } finally { f.dispose(); }
});
