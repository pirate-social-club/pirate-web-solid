import type { SongPurchaseModalState } from "./song-purchase-modal.types";

export function formatSavingsPercent(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

export function stateDefaults(state: SongPurchaseModalState | undefined): {
  confirmedDiscountPercent: number | null;
  error: string | null;
  forceMobile: boolean;
  processing: boolean;
  selfVerificationSavingsPercent: number | null;
  vinylReleaseAvailable: boolean;
} {
  switch (state) {
    case "mobile":
      return { confirmedDiscountPercent: null, error: null, forceMobile: true, processing: false, selfVerificationSavingsPercent: 20, vinylReleaseAvailable: false };
    case "processing":
      return { confirmedDiscountPercent: null, error: null, forceMobile: false, processing: true, selfVerificationSavingsPercent: 20, vinylReleaseAvailable: false };
    case "verified":
      return { confirmedDiscountPercent: 20, error: null, forceMobile: false, processing: false, selfVerificationSavingsPercent: null, vinylReleaseAvailable: false };
    case "vinyl-available":
      return { confirmedDiscountPercent: null, error: null, forceMobile: false, processing: false, selfVerificationSavingsPercent: 20, vinylReleaseAvailable: true };
    case "error":
      return { confirmedDiscountPercent: null, error: "Checkout transaction was rejected.", forceMobile: false, processing: false, selfVerificationSavingsPercent: 20, vinylReleaseAvailable: false };
    default:
      return { confirmedDiscountPercent: null, error: null, forceMobile: false, processing: false, selfVerificationSavingsPercent: 20, vinylReleaseAvailable: false };
  }
}

export function selfVerificationLabel(value: number | null | undefined): string | null {
  return typeof value === "number" && value > 0
    ? `Save up to ${formatSavingsPercent(value)}% with Self.xyz`
    : null;
}

export function purchaseButtonLabel(priceLabel: string, processing: boolean): string {
  return processing ? "Processing purchase" : `Unlock for ${priceLabel}`;
}
