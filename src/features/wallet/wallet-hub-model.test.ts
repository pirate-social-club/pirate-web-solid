import { describe, expect, test } from "bun:test";

import {
  buildGroupedAssets,
  buildWalletAssetRows,
  formatTotalBalanceUsd,
} from "./wallet-hub-model";
import { fiveChainSections } from "./wallet-flow-fixtures";

describe("wallet hub model", () => {
  test("groups duplicate assets, sums balances, and keeps IP/WIP at the top", () => {
    const grouped = buildGroupedAssets(fiveChainSections);
    expect(grouped.map((asset) => asset.symbol)).toEqual(["IP", "WIP", "pathUSD", "ETH", "USDC"]);
    expect(grouped[0]).toMatchObject({ totalBalance: "96.4", totalFiatValue: "$173.52", iconChainId: "story" });
    expect(grouped.find((asset) => asset.symbol === "ETH")).toMatchObject({ totalBalance: "0.4131", totalFiatValue: "$1,094.78", iconChainId: "ethereum" });
    expect(grouped.find((asset) => asset.symbol === "USDC")).toMatchObject({ totalBalance: "554.72", totalFiatValue: "$554.72", iconChainId: "ethereum" });
  });

  test("keeps each chain token as a sorted sendable/display row", () => {
    const rows = buildWalletAssetRows(fiveChainSections);
    expect(rows.map((row) => row.id)).toEqual([
      "story:ip", "story:wip", "tempo:tempo-pathusd", "optimism:op-eth", "base:base-usdc",
      "ethereum:eth", "base:base-eth", "ethereum:usdc-eth",
    ]);
  });

  test("formats a deterministic total with explicit prices when fiat is absent", () => {
    expect(formatTotalBalanceUsd([{
      chainId: "ethereum", title: "Ethereum", availability: "ready", tokens: [
        { id: "eth", symbol: "ETH", name: "Ether", balance: "2", usdPrice: 10 },
        { id: "zero", symbol: "USDC", name: "USD Coin", balance: "0", fiatValue: "$4.00" },
      ],
    }])).toBe("$24.00");
  });
});
