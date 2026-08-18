import { describe, expect, test } from "bun:test";

import { fiveChainSections, sharedWalletAddress } from "./wallet-flow-fixtures";
import {
  buildWalletReceiveSheetView,
  resolveReceiveChainId,
} from "./wallet-receive-sheet-view-model";
import type { WalletHubChainSection } from "./wallet-hub.types";

const laterSection: WalletHubChainSection = {
  chainId: "solana",
  title: "Solana",
  availability: "later",
  tokens: [],
  note: "Coming later",
};

describe("wallet receive sheet view model", () => {
  test("defaults to the highest-value address-bearing ready chain", () => {
    const view = buildWalletReceiveSheetView({ chainSections: fiveChainSections, open: true, onOpenChange: () => {} });
    expect(view.selectedChainId).toBe("tempo");
    expect(view.address).toBe(sharedWalletAddress);
    expect(view.addressLabel).toBe("0xc74e2d06...873abc");
  });

  test("honors a valid explicit selection and the default chain id", () => {
    const props = { chainSections: fiveChainSections, open: true, onOpenChange: () => {} };
    expect(resolveReceiveChainId(props, "story")).toBe("story");
    expect(resolveReceiveChainId({ ...props, defaultChainId: "base" })).toBe("base");
    expect(resolveReceiveChainId({ ...props, defaultChainId: "cosmos" })).toBe("tempo");
  });

  test("marks later chains disabled with their note and never selects them", () => {
    const view = buildWalletReceiveSheetView(
      { chainSections: [...fiveChainSections, laterSection], open: true, onOpenChange: () => {} },
      "solana",
    );
    const solana = view.chains.find((chain) => chain.chainId === "solana");
    expect(solana).toMatchObject({ disabled: true, note: "Coming later", selected: false });
    expect(view.selectedChainId).toBe("tempo");
  });

  test("disables ready chains without any address and falls back to the global wallet address", () => {
    const sections = fiveChainSections.map((section) => ({ ...section, walletAddress: null }));
    const withGlobal = buildWalletReceiveSheetView(
      { chainSections: sections, walletAddress: sharedWalletAddress, open: true, onOpenChange: () => {} },
      "base",
    );
    expect(withGlobal.selectedChainId).toBe("base");
    expect(withGlobal.address).toBe(sharedWalletAddress);

    const withoutGlobal = buildWalletReceiveSheetView({
      chainSections: sections,
      open: true,
      onOpenChange: () => {},
    });
    expect(withoutGlobal.selectedChainId).toBeUndefined();
    expect(withoutGlobal.address).toBeNull();
    expect(withoutGlobal.addressLabel).toBe("");
    expect(withoutGlobal.chains.every((chain) => chain.disabled)).toBe(true);
    expect(withoutGlobal.chains[0]?.note).toBe("Unavailable");
  });

  test("exposes per-chain fiat totals for the chain list", () => {
    const view = buildWalletReceiveSheetView({ chainSections: fiveChainSections, open: true, onOpenChange: () => {} });
    expect(view.chains.find((chain) => chain.chainId === "base")?.fiatLabel).toBe("$608.82");
  });
});
