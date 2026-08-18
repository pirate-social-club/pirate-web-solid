import { describe, expect, mock, test } from "bun:test";

import { fiveChainSections, sharedWalletAddress } from "./wallet-flow-fixtures";
import {
  buildWalletSendSheetView,
  resolveSendAsset,
  sendAssetId,
  type WalletSendFormState,
} from "./wallet-send-sheet-view-model";
import { getSendableAssets } from "./wallet-send-sheet-model";
import type { WalletHubChainSection } from "./wallet-hub.types";
import type { WalletSendConfirmState, WalletSendSheetProps } from "./wallet-send-sheet.types";

const VALID_RECIPIENT = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";

function makeProps(overrides: Partial<WalletSendSheetProps> = {}): WalletSendSheetProps {
  return { chainSections: fiveChainSections, open: true, onOpenChange: () => {}, ...overrides };
}

function makeForm(overrides: Partial<WalletSendFormState> = {}): WalletSendFormState {
  return { amount: "", recipient: "", submitAttempted: false, ...overrides };
}

describe("wallet send sheet view model", () => {
  test("lists only ready-chain assets with positive balances", () => {
    const laterWithBalance: WalletHubChainSection = {
      chainId: "solana",
      title: "Solana",
      availability: "later",
      tokens: [{ id: "sol", symbol: "SOL", name: "Solana", balance: "5", fiatValue: "$500.00" }],
    };
    const zeroBalance: WalletHubChainSection = {
      chainId: "base",
      title: "Base Sepolia",
      availability: "ready",
      tokens: [{ id: "zero", symbol: "DAI", name: "Dai", balance: "0", fiatValue: "$99.00" }],
    };
    const view = buildWalletSendSheetView(
      makeProps({ chainSections: [...fiveChainSections, laterWithBalance, zeroBalance] }),
      makeForm(),
    );

    expect(view.hasAssets).toBe(true);
    expect(view.assets.some((asset) => asset.id === "solana:sol")).toBe(false);
    expect(view.assets.some((asset) => asset.id === "base:zero")).toBe(false);
    expect(view.assets.find((asset) => asset.id === "tempo:tempo-pathusd")?.balance).toBe("1,204.11");
  });

  test("reports an empty asset list when every balance is zero", () => {
    const view = buildWalletSendSheetView(
      makeProps({
        chainSections: [{
          chainId: "ethereum",
          title: "Ethereum Sepolia",
          availability: "ready",
          tokens: [{ id: "eth", symbol: "ETH", name: "Ether", balance: "0" }],
        }],
      }),
      makeForm(),
    );
    expect(view.hasAssets).toBe(false);
    expect(view.canSubmit).toBe(false);
  });

  test("resolves the default asset and exposes its max amount", () => {
    const assets = getSendableAssets(fiveChainSections.filter((s) => s.availability === "ready"));
    const usdc = assets.find((asset) => asset.token.id === "base-usdc")!;
    expect(sendAssetId(usdc)).toBe("base:base-usdc");
    expect(resolveSendAsset(assets, "base:base-usdc")).toEqual(usdc);
    expect(resolveSendAsset(assets, "base:missing")).toBeNull();

    const view = buildWalletSendSheetView(makeProps({ defaultAssetId: "base:base-usdc" }), makeForm());
    expect(view.selectedAsset?.token.id).toBe("base-usdc");
    expect(view.maxAmount).toBe("512.36");
    expect(view.assets.find((asset) => asset.id === "base:base-usdc")?.selected).toBe(true);
  });

  test("blocks submission until recipient, asset, and amount are valid", () => {
    const onConfirm = mock(() => {});
    const props = makeProps({ onConfirm });

    const empty = buildWalletSendSheetView(props, makeForm({ submitAttempted: true }));
    expect(empty.canSubmit).toBe(false);
    expect(empty.showRecipientError).toBe(true);
    expect(empty.recipientError).toBe("Enter a recipient address.");
    expect(empty.amountError).toBe("Choose an asset first.");
    expect(empty.submit()).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();

    const badRecipient = buildWalletSendSheetView(props, makeForm({
      assetId: "base:base-usdc",
      amount: "10",
      recipient: "0x123",
      submitAttempted: true,
    }));
    expect(badRecipient.canSubmit).toBe(false);
    expect(badRecipient.recipientError).toBe("Enter a valid EVM address.");

    const overBalance = buildWalletSendSheetView(props, makeForm({
      assetId: "base:base-usdc",
      amount: "900",
      recipient: VALID_RECIPIENT,
      submitAttempted: true,
    }));
    expect(overBalance.canSubmit).toBe(false);
    expect(overBalance.amountError).toBe("Amount exceeds available balance.");
    expect(overBalance.showAmountError).toBe(true);
  });

  test("hides validation errors until the first submit attempt", () => {
    const view = buildWalletSendSheetView(makeProps(), makeForm());
    expect(view.recipientError).not.toBeNull();
    expect(view.showRecipientError).toBe(false);
    expect(view.showAmountError).toBe(false);
  });

  test("emits the validated intent on confirm", () => {
    const onConfirm = mock((_state: WalletSendConfirmState) => {});
    const view = buildWalletSendSheetView(makeProps({ onConfirm }), makeForm({
      assetId: "base:base-usdc",
      amount: " 100.5 ",
      recipient: ` ${VALID_RECIPIENT} `,
      submitAttempted: true,
    }));

    expect(view.canSubmit).toBe(true);
    expect(view.submit()).toBe(true);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const intent = onConfirm.mock.calls[0]![0];
    expect(intent.amount).toBe("100.5");
    expect(intent.recipient).toBe(VALID_RECIPIENT);
    expect(intent.asset.token.id).toBe("base-usdc");
  });

  test("reflects the pending submission state", () => {
    const onConfirm = mock(() => {});
    const view = buildWalletSendSheetView(makeProps({ onConfirm, step: "pending" }), makeForm({
      assetId: "base:base-usdc",
      amount: "10",
      recipient: VALID_RECIPIENT,
      submitAttempted: true,
    }));

    expect(view.pending).toBe(true);
    expect(view.canSubmit).toBe(false);
    expect(view.submit()).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("surfaces error and success states with a short tx hash", () => {
    const failed = buildWalletSendSheetView(
      makeProps({ step: "error", errorMessage: "Rejected in wallet." }),
      makeForm(),
    );
    expect(failed.errorMessage).toBe("Rejected in wallet.");

    const fallback = buildWalletSendSheetView(makeProps({ step: "error" }), makeForm());
    expect(fallback.errorMessage).toBe("Transaction failed.");

    const succeeded = buildWalletSendSheetView(
      makeProps({ step: "success", txHash: sharedWalletAddress }),
      makeForm(),
    );
    expect(succeeded.statusMessage).toBe("Transaction submitted.");
    expect(succeeded.txHashLabel).toBe("0xc74e...3abc");
  });
});
