import {
  formatShortAddress,
  getSendableAssets,
  validateAmount,
  validateEvmAddress,
} from "./wallet-send-sheet-model";
import type { WalletSendAsset, WalletSendSheetProps } from "./wallet-send-sheet.types";

export interface WalletSendFormState {
  amount: string;
  assetId?: string;
  recipient: string;
  /** True after the first confirm attempt; gates error display. */
  submitAttempted: boolean;
}

export interface WalletSendAssetOption {
  balance: string;
  chainId: WalletSendAsset["chainId"];
  chainTitle: string;
  fiatLabel: string | null;
  id: string;
  selected: boolean;
  symbol: string;
}

export interface WalletSendSheetView {
  amountError: string | null;
  assets: WalletSendAssetOption[];
  canSubmit: boolean;
  errorMessage?: string;
  feeLabel?: string;
  hasAssets: boolean;
  maxAmount?: string;
  pending: boolean;
  recipientError: string | null;
  selectedAsset: WalletSendAsset | null;
  showAmountError: boolean;
  showRecipientError: boolean;
  statusMessage?: string;
  submit: () => boolean;
  txHashLabel?: string;
}

export function sendAssetId(asset: WalletSendAsset): string {
  return `${asset.chainId}:${asset.token.id}`;
}

export function resolveSendAsset(
  assets: WalletSendAsset[],
  assetId: string | undefined,
): WalletSendAsset | null {
  if (!assetId) return null;
  return assets.find((asset) => sendAssetId(asset) === assetId) ?? null;
}

export function buildWalletSendSheetView(
  props: WalletSendSheetProps,
  form: WalletSendFormState,
): WalletSendSheetView {
  const readySections = props.chainSections.filter((section) => section.availability === "ready");
  const assets = getSendableAssets(readySections);
  const selectedAsset = resolveSendAsset(assets, form.assetId ?? props.defaultAssetId);
  const pending = props.step === "pending";

  const recipientError = validateEvmAddress(form.recipient);
  const amountError = validateAmount(form.amount, selectedAsset);
  const canSubmit = !pending && recipientError === null && amountError === null;

  return {
    assets: assets.map((asset) => ({
      id: sendAssetId(asset),
      chainId: asset.chainId,
      chainTitle: asset.chainTitle,
      symbol: asset.token.symbol,
      balance: asset.token.balance ?? "0",
      fiatLabel: asset.token.fiatValue ?? null,
      selected: selectedAsset != null && sendAssetId(asset) === sendAssetId(selectedAsset),
    })),
    hasAssets: assets.length > 0,
    selectedAsset,
    maxAmount: selectedAsset?.token.balance,
    recipientError,
    amountError,
    showRecipientError: form.submitAttempted && recipientError !== null,
    showAmountError: form.submitAttempted && amountError !== null,
    canSubmit,
    pending,
    feeLabel: props.feeLabel,
    errorMessage: props.step === "error" ? props.errorMessage ?? "Transaction failed." : undefined,
    statusMessage: props.step === "success" ? "Transaction submitted." : undefined,
    txHashLabel: props.txHash ? formatShortAddress(props.txHash) : undefined,
    submit: () => {
      if (!canSubmit || !selectedAsset) return false;
      props.onConfirm?.({
        amount: form.amount.trim(),
        asset: selectedAsset,
        recipient: form.recipient.trim(),
      });
      return true;
    },
  };
}
