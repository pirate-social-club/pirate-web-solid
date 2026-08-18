import type { WalletHubChainSection } from "./wallet-hub.types";
import type { WalletSendAsset } from "./wallet-send-sheet.types";

export function parseDisplayNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number(value.replace(/,/gu, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseFiatValue(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number(value.replace(/[^0-9.-]/gu, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getSendableAssets(chainSections: WalletHubChainSection[]): WalletSendAsset[] {
  return chainSections.flatMap((section) => section.tokens
    .filter((token) => parseDisplayNumber(token.balance) > 0)
    .sort((left, right) => parseFiatValue(right.fiatValue) - parseFiatValue(left.fiatValue))
    .map((token) => ({ chainId: section.chainId, chainTitle: section.title, token })));
}

export function validateEvmAddress(value: string): string | null {
  if (!value.trim()) return "Enter a recipient address.";
  if (!/^0x[a-fA-F0-9]{40}$/u.test(value.trim())) return "Enter a valid EVM address.";
  return null;
}

export function validateAmount(value: string, asset: WalletSendAsset | null): string | null {
  if (!asset) return "Choose an asset first.";
  const amount = parseDisplayNumber(value);
  if (!value.trim() || amount <= 0) return "Enter an amount.";
  if (amount > parseDisplayNumber(asset.token.balance)) return "Amount exceeds available balance.";
  return null;
}

export function formatShortAddress(value: string): string {
  return value.length <= 16 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
}
