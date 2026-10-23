import type { Address } from "viem";
import { walletNetworkHost } from "../features/wallet/wallet-network-catalog.ts";

/** The one asset api-next sponsors for a persona-wallet Send on a given host. */
export type SponsoredSendNetwork = Readonly<{ chainId: 8453 | 84532; usdc: Address }>;

export const BASE_SEPOLIA_SPONSORED_SEND: SponsoredSendNetwork = {
  chainId: 84532,
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

export const BASE_SPONSORED_SEND: SponsoredSendNetwork = {
  chainId: 8453,
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

/**
 * Production sponsors Base USDC and every other environment Base Sepolia USDC,
 * matching api-next. Staging and local hosts are the switchable ones.
 */
export function sponsoredSendNetwork(hostname: string): SponsoredSendNetwork {
  return walletNetworkHost(hostname).switchable ? BASE_SEPOLIA_SPONSORED_SEND : BASE_SPONSORED_SEND;
}
