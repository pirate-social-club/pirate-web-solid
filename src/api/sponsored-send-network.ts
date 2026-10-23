import type { Address } from "viem";

/** The one asset api-next sponsors for a persona-wallet Send on a given deployment. */
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
 * Each deployment's canonical origin, as its Worker configures it. Production sponsors
 * Base USDC; staging and local development sponsor Base Sepolia USDC, matching api-next.
 */
const SPONSORED_SEND_BY_DEPLOYMENT: ReadonlyMap<string, SponsoredSendNetwork> = new Map([
  ["https://pirate.sc", BASE_SPONSORED_SEND],
  ["https://web-next-staging.pirate.sc", BASE_SEPOLIA_SPONSORED_SEND],
  ["http://127.0.0.1:8787", BASE_SEPOLIA_SPONSORED_SEND],
]);

/**
 * The network for the deployment that served this page, named by the canonical origin
 * its SSR records on every host it serves, HNS ingress hosts included. The page's own
 * hostname is never consulted: an HNS name says nothing about which deployment serves
 * it. An unknown or missing origin offers no network.
 */
export function sponsoredSendNetwork(servedCanonicalOrigin: string | undefined): SponsoredSendNetwork | undefined {
  return servedCanonicalOrigin === undefined ? undefined : SPONSORED_SEND_BY_DEPLOYMENT.get(servedCanonicalOrigin);
}

/** The network of the deployment that served this document; none outside a browser. */
export function servedSponsoredSendNetwork(
  root: Readonly<{ dataset: DOMStringMap }> | undefined = globalThis.document?.documentElement,
): SponsoredSendNetwork | undefined {
  return sponsoredSendNetwork(root?.dataset.publicAppCanonicalOrigin);
}
