import { describe, expect, test } from "bun:test";

import { fiveChainSections } from "./wallet-flow-fixtures";
import {
  formatShortAddress,
  getSendableAssets,
  parseDisplayNumber,
  validateAmount,
  validateEvmAddress,
} from "./wallet-send-sheet-model";

describe("wallet send sheet model", () => {
  test("filters zero balances and sorts each chain by fiat value", () => {
    const sections = [...fiveChainSections, {
      chainId: "base" as const,
      title: "Base Sepolia",
      availability: "ready" as const,
      tokens: [{ id: "zero", symbol: "DAI", name: "Dai", balance: "0", fiatValue: "$99.00" }],
    }];
    const assets = getSendableAssets(sections);
    expect(assets.some((asset) => asset.token.id === "zero")).toBe(false);
    expect(assets.filter((asset) => asset.chainId === "base").map((asset) => asset.token.id)).toEqual(["base-usdc", "base-eth"]);
    expect(assets.filter((asset) => asset.chainId === "ethereum").map((asset) => asset.token.id)).toEqual(["eth", "usdc-eth"]);
  });

  test("validates EVM recipients and normalizes display numbers", () => {
    expect(validateEvmAddress("")).toBe("Enter a recipient address.");
    expect(validateEvmAddress("0x123")).toBe("Enter a valid EVM address.");
    expect(validateEvmAddress("  0xc74e2d06c9a7e304817b3c177b91e0c1f4873abc  ")).toBeNull();
    expect(parseDisplayNumber("1,204.11")).toBe(1204.11);
    expect(formatShortAddress("0xc74e2d06c9a7e304817b3c177b91e0c1f4873abc")).toBe("0xc74e...3abc");
  });

  test("enforces positive amounts within the selected balance", () => {
    const asset = getSendableAssets(fiveChainSections).find((item) => item.token.id === "base-usdc")!;
    expect(validateAmount("", asset)).toBe("Enter an amount.");
    expect(validateAmount("0", asset)).toBe("Enter an amount.");
    expect(validateAmount("900", asset)).toBe("Amount exceeds available balance.");
    expect(validateAmount("100", asset)).toBeNull();
    expect(validateAmount("1", null)).toBe("Choose an asset first.");
  });
});
