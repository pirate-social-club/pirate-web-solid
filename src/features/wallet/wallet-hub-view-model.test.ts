import { describe, expect, mock, test } from "bun:test";

import { fiveChainSections, sharedWalletAddress } from "./wallet-flow-fixtures";
import { buildWalletHubView, formatWalletAddressLabel } from "./wallet-hub-view-model";
import type { WalletHubChainSection, WalletHubProps } from "./wallet-hub.types";

const laterSection: WalletHubChainSection = {
  chainId: "solana",
  title: "Solana",
  availability: "later",
  tokens: [],
  note: "Coming later",
};

const emptyReadySection: WalletHubChainSection = {
  chainId: "ethereum",
  title: "Ethereum Sepolia",
  availability: "ready",
  tokens: [],
};

describe("wallet hub view model", () => {
  test("summarizes the populated five-chain wallet with computed totals", () => {
    const view = buildWalletHubView({
      chainSections: fiveChainSections,
      walletAddress: sharedWalletAddress,
    });

    expect(view.connected).toBe(true);
    expect(view.isEmpty).toBe(false);
    expect(view.totalBalanceLabel).toBe("$3,059.89");
    expect(view.walletLabel).toBe("0xc74e…3abc");
    expect(view.readySections).toHaveLength(5);
    expect(view.laterSections).toHaveLength(0);
    expect(view.assetRows.map((row) => row.id)).toEqual([
      "story:ip", "story:wip", "tempo:tempo-pathusd", "optimism:op-eth", "base:base-usdc",
      "ethereum:eth", "base:base-eth", "ethereum:usdc-eth",
    ]);
  });

  test("respects an explicit total balance override", () => {
    const view = buildWalletHubView({
      chainSections: fiveChainSections,
      walletAddress: sharedWalletAddress,
      totalBalanceUsd: "$9,999.99",
    });
    expect(view.totalBalanceLabel).toBe("$9,999.99");
  });

  test("marks empty wallets, blanks the total, and disables send", () => {
    const onSend = mock(() => {});
    const view = buildWalletHubView({
      chainSections: [emptyReadySection],
      walletAddress: sharedWalletAddress,
      onSend,
    });

    expect(view.isEmpty).toBe(true);
    expect(view.totalBalanceLabel).toBeNull();
    expect(view.assetRows).toEqual([]);
    expect(view.actions.send.disabled).toBe(true);
  });

  test("separates later chains without counting their tokens as assets", () => {
    const view = buildWalletHubView({
      chainSections: [...fiveChainSections, laterSection],
      walletAddress: sharedWalletAddress,
    });

    expect(view.laterSections).toEqual([laterSection]);
    expect(view.readySections.map((section) => section.chainId)).not.toContain("solana");
  });

  test("reflects unconnected wallet state", () => {
    const view = buildWalletHubView({ chainSections: fiveChainSections });

    expect(view.connected).toBe(false);
    expect(view.walletLabel).toBe("No wallet connected");
    expect(view.actions.changeWallet.label).toBe("Connect wallet");
    expect(view.actions.changeWallet.disabled).toBe(true);
  });

  test("reflects connected wallet state with a change-wallet action", () => {
    const onChangeWallet = mock(() => {});
    const view = buildWalletHubView({
      chainSections: fiveChainSections,
      walletAddress: sharedWalletAddress,
      onChangeWallet,
    });

    expect(view.actions.changeWallet.label).toBe("Change wallet");
    expect(view.actions.changeWallet.disabled).toBe(false);
    view.actions.changeWallet.onSelect?.();
    expect(onChangeWallet).toHaveBeenCalledTimes(1);
  });

  test("blocks wallet changes while wallet actions are pending", () => {
    const onChangeWallet = mock(() => {});
    const view = buildWalletHubView({
      chainSections: fiveChainSections,
      walletAddress: sharedWalletAddress,
      walletActionsPending: true,
      onChangeWallet,
    });

    expect(view.actions.changeWallet.disabled).toBe(true);
    expect(view.actions.changeWallet.pending).toBe(true);
  });

  test("drives receive and send callbacks", () => {
    const onReceive = mock(() => {});
    const onSend = mock(() => {});
    const view = buildWalletHubView({
      chainSections: fiveChainSections,
      walletAddress: sharedWalletAddress,
      onReceive,
      onSend,
    });

    expect(view.actions.receive.disabled).toBe(false);
    expect(view.actions.send.disabled).toBe(false);
    view.actions.receive.onSelect?.();
    view.actions.send.onSelect?.();
    expect(onReceive).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  test("exposes a precise claim action with sales count", () => {
    const onClaim = mock(() => {});
    const view = buildWalletHubView({
      chainSections: fiveChainSections,
      walletAddress: sharedWalletAddress,
      claimableWipWei: "12450000000000000000",
      claimableSalesCount: 3,
      onClaim,
    });

    expect(view.claim?.amountLabel).toBe("12.45 WIP");
    expect(view.claim?.supportingLabel).toBe("3 sales");
    expect(view.claim?.action.disabled).toBe(false);
    view.claim?.action.onSelect?.();
    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  test("disables the claim action while a claim is loading", () => {
    const onClaim = mock(() => {});
    const view = buildWalletHubView({
      chainSections: fiveChainSections,
      walletAddress: sharedWalletAddress,
      claimableWipWei: "12450000000000000000",
      claimableSalesCount: 1,
      claimLoading: true,
      onClaim,
    });

    expect(view.claim?.supportingLabel).toBe("1 sale");
    expect(view.claim?.action.label).toBe("Claiming…");
    expect(view.claim?.action.disabled).toBe(true);
    expect(view.claim?.action.pending).toBe(true);
  });

  test("omits the claim block when nothing is claimable", () => {
    const view = buildWalletHubView({
      chainSections: fiveChainSections,
      walletAddress: sharedWalletAddress,
    });
    expect(view.claim).toBeUndefined();
  });

  test("passes rewards summary through and gates a pending reward action", () => {
    const onAction = mock(() => {});
    const pending = buildWalletHubView({
      chainSections: fiveChainSections,
      walletAddress: sharedWalletAddress,
      rewardsSummary: {
        actionLabel: "Claim rewards",
        amountLabel: "4.20",
        assetLabel: "WIP",
        supportingLabel: "Epoch 12",
        pending: true,
        onAction,
      },
    });
    expect(pending.rewards?.action?.disabled).toBe(true);
    expect(pending.rewards?.action?.pending).toBe(true);

    const ready = buildWalletHubView({
      chainSections: fiveChainSections,
      walletAddress: sharedWalletAddress,
      rewardsSummary: {
        actionLabel: "Claim rewards",
        amountLabel: "4.20",
        assetLabel: "WIP",
        onAction,
      },
    });
    expect(ready.rewards?.action?.disabled).toBe(false);
    ready.rewards?.action?.onSelect?.();
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  test("drives the activity action and keeps activity items in order", () => {
    const onViewActivity = mock(() => {});
    const recentActivity = [
      { id: "a1", title: "Royalty claimed", amount: "+12.45 WIP", timestamp: "2026-08-01" },
      { id: "a2", title: "Sent USDC", amount: "-10 USDC" },
    ];
    const view = buildWalletHubView({
      chainSections: fiveChainSections,
      walletAddress: sharedWalletAddress,
      recentActivity,
      onViewActivity,
    });

    expect(view.recentActivity).toEqual(recentActivity);
    view.actions.viewActivity.onSelect?.();
    expect(onViewActivity).toHaveBeenCalledTimes(1);
  });

  test("disables actions whose callbacks are absent", () => {
    const view = buildWalletHubView({
      chainSections: fiveChainSections,
      walletAddress: sharedWalletAddress,
      claimableWipWei: "12450000000000000000",
    });

    expect(view.actions.receive.disabled).toBe(true);
    expect(view.actions.send.disabled).toBe(true);
    expect(view.actions.viewActivity.disabled).toBe(true);
    expect(view.claim?.action.disabled).toBe(true);
  });

  test("formats wallet addresses defensively", () => {
    expect(formatWalletAddressLabel(null)).toBe("No wallet connected");
    expect(formatWalletAddressLabel(undefined)).toBe("No wallet connected");
    expect(formatWalletAddressLabel("0xabc")).toBe("0xabc");
  });

  test("falls back to the default title", () => {
    const props: WalletHubProps = { chainSections: [] };
    expect(buildWalletHubView(props).title).toBe("Wallet");
    expect(buildWalletHubView({ ...props, title: "My wallet" }).title).toBe("My wallet");
  });
});
