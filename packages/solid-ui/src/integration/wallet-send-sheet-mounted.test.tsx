import { screen } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createSignal, flush } from "solid-js";

import { render } from "../test/test-utils";
import { fiveChainSections, sharedWalletAddress } from "../../../../src/features/wallet/wallet-flow-fixtures";
import { WalletSendSheet } from "../../../../src/features/wallet/wallet-send-sheet";

describe("WalletSendSheet reactive reset", () => {
  it("resets selected asset and entered form state when the resolved default changes with chainSections", async () => {
    const user = userEvent.setup();
    const [sections, setSections] = createSignal(fiveChainSections);
    render(() => (
      <WalletSendSheet
        amount="100"
        chainSections={sections()}
        defaultAssetId="base:base-usdc"
        defaultRecipient={sharedWalletAddress}
        onOpenChange={() => {}}
        open
      />
    ));
    flush();

    const eth = screen.getByRole("button", { name: "Select ETH on Ethereum Sepolia" });
    await user.click(eth);
    flush();

    const recipient = screen.getByRole("textbox", { name: "Recipient" }) as HTMLInputElement;
    const amount = screen.getByRole("textbox", { name: "Amount" }) as HTMLInputElement;
    await user.clear(recipient);
    await user.type(recipient, "0x742d35Cc6634C0532925a3b844Bc454e4438f44e");
    await user.clear(amount);
    await user.type(amount, "50");
    flush();
    expect(screen.getByRole("button", { name: "Select ETH on Ethereum Sepolia" })).toHaveAttribute("aria-pressed", "true");
    expect(recipient).toHaveValue("0x742d35Cc6634C0532925a3b844Bc454e4438f44e");
    expect(amount).toHaveValue("50");

    setSections(fiveChainSections.filter((section) => section.chainId === "tempo"));
    flush();

    const tempo = screen.getByRole("button", { name: "Select pathUSD on Tempo Moderato" });
    expect(tempo).toHaveAttribute("aria-pressed", "true");
    expect(recipient).toHaveValue(sharedWalletAddress);
    expect(amount).toHaveValue("100");
  });
});
