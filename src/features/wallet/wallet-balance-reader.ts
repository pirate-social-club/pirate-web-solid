import { createPublicClient, erc20Abi, formatUnits, getAddress, http } from "viem";
import { walletNetworkCatalog, type WalletNetworkMode } from "./wallet-network-catalog";
import type { WalletHubChainSection } from "./wallet-hub.types";

export type WalletBalanceReader = (address: string, mode: WalletNetworkMode, signal: AbortSignal) => Promise<WalletHubChainSection[]>;

/** Browser-only chain reads. App sessions, cookies and persona identifiers never go to RPC providers. */
export const readWalletBalances: WalletBalanceReader = async (walletAddress, mode, signal) => {
  const address = getAddress(walletAddress);
  return Promise.all(walletNetworkCatalog(mode).map(async network => {
    const client = createPublicClient({ chain: network.chain, transport: http(network.chain.rpcUrls.default.http[0], {
      retryCount: 0, timeout: 8_000,
      fetchOptions: { signal, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error" },
    }) });
    const unavailable = () => network.tokens.map(token => ({ id: token.id, symbol: token.symbol, name: token.name, balance: "Unavailable" }));
    let tokens;
    try {
      if (await client.getChainId() !== network.chain.id) throw new Error("wallet_network_mismatch");
      tokens = await Promise.all(network.tokens.map(async token => {
        let balance = "Unavailable";
        try {
          const amount = token.address
            ? await client.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [address] })
            : await client.getBalance({ address });
          balance = formatUnits(amount, token.decimals);
        } catch { /* One failed token read must not erase successful reads on other assets. */ }
        return { id: token.id, symbol: token.symbol, name: token.name, balance };
      }));
    } catch { tokens = unavailable(); }
    return { chainId: network.chainId, title: network.title, availability: "ready" as const, walletAddress: address, tokens, balancesUnavailable: tokens.some(token => token.balance === "Unavailable") };
  }));
};
