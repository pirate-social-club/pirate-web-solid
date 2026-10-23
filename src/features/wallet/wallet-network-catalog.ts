import { mainnet, sepolia, base, baseSepolia, story, storyAeneid } from "viem/chains";
import type { Address, Chain } from "viem";
import type { WalletHubChainId, WalletHubChainSection } from "./wallet-hub.types";
import { sponsoredSendNetwork } from "../../api/sponsored-send-network.ts";

export type WalletNetworkMode = "mainnet" | "testnet";

export interface WalletNetworkHost {
  readonly defaultMode: WalletNetworkMode;
  readonly switchable: boolean;
  /** The network whose Base USDC row offers Claim and Send; none on an unknown deployment. */
  readonly actionMode: WalletNetworkMode | undefined;
}

/**
 * The networks offered by the deployment that served the page, named by the canonical
 * origin its SSR records on every host, HNS ingress hosts included; the address bar
 * never decides. Production has no network switch and stays on mainnet, where its Claim
 * and Send run on Base. Staging and local development add testnet, open on it, and run
 * Claim and Send on Base Sepolia. An unknown deployment shows mainnet only, without
 * Claim or Send.
 */
export function walletNetworkHost(servedCanonicalOrigin: string | undefined): WalletNetworkHost {
  const network = sponsoredSendNetwork(servedCanonicalOrigin);
  if (network === undefined) return { defaultMode: "mainnet", switchable: false, actionMode: undefined };
  return network.chainId === 8453
    ? { defaultMode: "mainnet", switchable: false, actionMode: "mainnet" }
    : { defaultMode: "testnet", switchable: true, actionMode: "testnet" };
}

export interface WalletAssetDefinition {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  address?: Address;
}
export interface WalletNetworkDefinition {
  chainId: WalletHubChainId;
  title: string;
  chain: Chain;
  tokens: readonly WalletAssetDefinition[];
}
const ether: WalletAssetDefinition = { id: "eth", symbol: "ETH", name: "Ether", decimals: 18 };
const usdc = (address: Address): WalletAssetDefinition => ({ id: "usdc", symbol: "USDC", name: "USD Coin", decimals: 6, address });

/** Fixed catalog; addresses are Circle's native USDC deployments, not user input. */
export function walletNetworkCatalog(mode: WalletNetworkMode): readonly WalletNetworkDefinition[] {
  const test = mode === "testnet";
  return [
    { chainId: "ethereum", title: test ? "Ethereum Sepolia" : "Ethereum", chain: test ? sepolia : mainnet, tokens: [ether, usdc(test ? "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" : "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")] },
    { chainId: "data", title: test ? "DATA Network Aeneid" : "DATA Network", chain: test ? storyAeneid : story, tokens: [{ id: "data", symbol: "$DATA", name: "DATA", decimals: 18 }] },
    { chainId: "base", title: test ? "Base Sepolia" : "Base", chain: test ? baseSepolia : base, tokens: [ether, usdc(test ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e" : "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")] },
  ];
}

export const WALLET_RPC_ORIGINS = [...new Set((["mainnet", "testnet"] as const).flatMap(mode => walletNetworkCatalog(mode).map(network => new URL(network.chain.rpcUrls.default.http[0]!).origin)))];

export function walletAssetSections(address: string | null, mode: WalletNetworkMode, balance = "Unavailable"): WalletHubChainSection[] {
  return walletNetworkCatalog(mode).map(network => ({
    chainId: network.chainId, title: network.title, availability: "ready", walletAddress: address,
    balancesUnavailable: true,
    tokens: network.tokens.map(token => ({ id: token.id, symbol: token.symbol, name: token.name, balance })),
  }));
}
