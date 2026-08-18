import { createEffect, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { fiveChainSections, sharedWalletAddress } from "./wallet-flow-fixtures";
import { WalletSendSheet } from "./wallet-send-sheet";
import type { WalletSendSheetProps } from "./wallet-send-sheet.types";

const meta = {
  title: "Compositions/Wallet/WalletSendSheet",
  component: WalletSendSheet,
  args: { chainSections: fiveChainSections, defaultAssetId: "base:base-usdc", defaultRecipient: sharedWalletAddress, feeLabel: "~$0.01", onOpenChange: () => undefined, open: true },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof WalletSendSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

function StoryRender(props: WalletSendSheetProps) {
  const [open, setOpen] = createSignal(props.open);
  createEffect(() => props.open, (nextOpen) => { setOpen(nextOpen); });
  return <div class="min-h-screen bg-background p-6"><WalletSendSheet {...props} onOpenChange={setOpen} open={open()} /></div>;
}

export const AssetNetwork: Story = { args: { step: "asset" }, render: (args) => <StoryRender {...args} /> };
export const Mobile: Story = { args: { forceMobile: true, step: "asset" }, parameters: { viewport: { defaultViewport: "mobile1" } }, render: (args) => <StoryRender {...args} /> };
export const InvalidAddress: Story = { args: { defaultRecipient: "0x123", step: "asset" }, render: (args) => <StoryRender {...args} /> };
export const Pending: Story = { args: { amount: "100", step: "pending" }, render: (args) => <StoryRender {...args} /> };
export const Success: Story = { args: { amount: "100", step: "success", txHash: "0x4b6c1234567890abcdef" }, render: (args) => <StoryRender {...args} /> };
export const Error: Story = { args: { amount: "100", step: "error", errorMessage: "Transaction failed. Try again." }, render: (args) => <StoryRender {...args} /> };

export const FullFlow: Story = {
  args: { defaultRecipient: "", step: "asset", onConfirm: fn() },
  render: (args) => <StoryRender {...args} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByPlaceholderText("0x…"), sharedWalletAddress);
    await userEvent.type(canvas.getByPlaceholderText("0.0"), "100");
    await userEvent.click(canvas.getByRole("button", { name: "Review and send" }));
    await expect(args.onConfirm).toHaveBeenCalledWith(expect.objectContaining({ amount: "100", recipient: sharedWalletAddress }));
  },
};
