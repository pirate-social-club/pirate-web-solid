import { describe, expect, test } from "bun:test";

import { fiveChainSections, sharedWalletAddress } from "./wallet-flow-fixtures";
import {
  chainFiatTotal,
  formatFiatTotal,
  getDefaultReceiveChainId,
  truncateReceiveAddress,
} from "./wallet-receive-sheet-model";

describe("wallet receive sheet model", () => {
  test("chooses an explicit valid chain before the highest-value address-bearing chain", () => {
    expect(getDefaultReceiveChainId(fiveChainSections)).toBe("tempo");
    expect(getDefaultReceiveChainId(fiveChainSections, "story")).toBe("story");
    expect(getDefaultReceiveChainId(fiveChainSections, "cosmos")).toBe("tempo");
  });

  test("ignores chains without addresses and formats their deterministic totals", () => {
    const sections = fiveChainSections.map((section) => ({ ...section, walletAddress: section.chainId === "base" ? sharedWalletAddress : null }));
    expect(getDefaultReceiveChainId(sections)).toBe("base");
    expect(chainFiatTotal(sections[1]!)).toBe(608.82);
    expect(formatFiatTotal(sections[1]!)).toBe("$608.82");
  });

  test("truncates only the visual address label", () => {
    expect(truncateReceiveAddress(sharedWalletAddress)).toBe("0xc74e2d06...873abc");
  });
});
