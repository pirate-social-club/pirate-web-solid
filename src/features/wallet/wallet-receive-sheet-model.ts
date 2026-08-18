import type { WalletHubChainId, WalletHubChainSection } from "./wallet-hub.types";

function parseFiatValue(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number(value.replace(/[^0-9.-]/gu, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function chainFiatTotal(section: WalletHubChainSection): number {
  return section.tokens.reduce((total, token) => total + parseFiatValue(token.fiatValue), 0);
}

export function formatFiatTotal(section: WalletHubChainSection): string {
  return chainFiatTotal(section).toLocaleString("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  });
}

export function getDefaultReceiveChainId(
  chainSections: WalletHubChainSection[],
  defaultChainId?: WalletHubChainId,
): WalletHubChainId | undefined {
  if (defaultChainId && chainSections.some((section) => section.chainId === defaultChainId)) {
    return defaultChainId;
  }
  return chainSections.reduce<WalletHubChainSection | undefined>((bestSection, section) => {
    if (!section.walletAddress) return bestSection;
    if (!bestSection) return section;
    return chainFiatTotal(bestSection) >= chainFiatTotal(section) ? bestSection : section;
  }, undefined)?.chainId;
}

export function truncateReceiveAddress(address: string | null | undefined): string {
  if (!address) return "";
  return `${address.slice(0, 10)}...${address.slice(-6)}`;
}
