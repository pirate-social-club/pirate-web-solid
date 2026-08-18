import type { RoyaltyClaimModalState, RoyaltyClaimState } from "./royalty-claim-modal.types";

export const DEFAULT_CLAIMABLE_WIP_WEI = "12450000000000000000";
export const DEFAULT_WALLET_ADDRESS = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

export function formatWipAmount(wei: string | null | undefined): string {
  if (!wei) return "0";
  try {
    const formatted = formatUnits(BigInt(wei), 18);
    const [whole, fraction = ""] = formatted.split(".");
    const trimmedFraction = fraction.slice(0, 6).replace(/0+$/u, "");
    if (whole === "0" && fraction.replace(/0/gu, "").length > 0 && !trimmedFraction) {
      return "<0.000001";
    }
    return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
  } catch {
    return "0";
  }
}

function formatUnits(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = absolute / base;
  const fraction = absolute % base;
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/u, "");
  return `${negative ? "-" : ""}${whole.toString()}${fractionText ? `.${fractionText}` : ""}`;
}

export function formatWalletAddress(address: string | null | undefined): string {
  // Runtime checksum normalization belongs to the future wallet adapter.
  if (!address || !/^0x[0-9a-fA-F]{40}$/u.test(address)) return "No wallet connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function claimableWipLabel(
  totalClaimableWipWei: string | null | undefined,
  loading = false,
): string {
  return loading ? "..." : `${formatWipAmount(totalClaimableWipWei)} WIP`;
}

export function isRoyaltyClaimBusy(status: RoyaltyClaimModalState): boolean {
  return status === "preparing" || status === "signing" || status === "submitting";
}

export function royaltyPrimaryAction(
  state: RoyaltyClaimState,
  walletAddress: string | null | undefined,
): { disabled: boolean; label: string } {
  if (!walletAddress) return { disabled: false, label: "Connect wallet" };
  if (state.status === "preparing") return { disabled: true, label: "Preparing claim" };
  if (state.status === "signing") return { disabled: true, label: "Confirm in wallet" };
  if (state.status === "submitting") return { disabled: true, label: "Submitting claim" };
  if (state.status === "success") return { disabled: true, label: "Royalties claimed" };
  if (state.status === "error") return { disabled: false, label: "Claim failed" };
  if (state.status === "ready") return { disabled: false, label: "Claim" };
  return { disabled: false, label: "Claim" };
}
