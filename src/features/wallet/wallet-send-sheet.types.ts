import type { WalletHubChainId, WalletHubChainSection, WalletHubToken } from "./wallet-hub.types";

export type WalletSendStep = "asset" | "recipient" | "amount" | "review" | "pending" | "success" | "error";

export interface WalletSendAsset {
  chainId: WalletHubChainId;
  chainTitle: string;
  token: WalletHubToken;
}

interface WalletSendConfirmState {
  amount: string;
  asset: WalletSendAsset;
  recipient: string;
}

export interface WalletSendSheetProps {
  amount?: string;
  chainSections: WalletHubChainSection[];
  defaultAssetId?: string;
  defaultRecipient?: string;
  errorMessage?: string;
  feeLabel?: string;
  forceMobile?: boolean;
  onConfirm?: (state: WalletSendConfirmState) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  step?: WalletSendStep;
  txHash?: string;
}
