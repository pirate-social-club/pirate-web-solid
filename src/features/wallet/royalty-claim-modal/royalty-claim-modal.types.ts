export type RoyaltyClaimModalState =
  | "ready"
  | "no-wallet"
  | "preparing"
  | "signing"
  | "submitting"
  | "success"
  | "error";

export interface RoyaltyClaimState {
  message?: string;
  status: RoyaltyClaimModalState;
  txHash?: string;
}

export interface RoyaltyClaimModalProps {
  autoUnwrapIpTokens?: boolean;
  claimableCount?: number;
  claimState?: RoyaltyClaimState;
  forceMobile?: boolean;
  loading?: boolean;
  onAutoUnwrapIpTokensChange?: (checked: boolean) => void;
  onClaim?: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  totalClaimableWipWei?: string;
  walletAddress?: string | null;
}
