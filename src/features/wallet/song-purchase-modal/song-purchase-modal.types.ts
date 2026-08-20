export type SongPurchaseModalState =
  | "desktop"
  | "mobile"
  | "processing"
  | "verified"
  | "vinyl-available"
  | "error";

export interface SongPurchaseModalProps {
  confirmedDiscountPercent?: number | null;
  error?: string | null;
  forceMobile?: boolean;
  onConfirm?: () => void;
  onOpenChange: (open: boolean) => void;
  onSelfVerificationClick?: () => void;
  open: boolean;
  priceLabel: string;
  processing?: boolean;
  selfVerificationSavingsPercent?: number | null;
  songTitle: string;
  state?: SongPurchaseModalState;
  vinylReleaseAvailable?: boolean;
}
