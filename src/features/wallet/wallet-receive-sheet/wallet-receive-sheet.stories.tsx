import { createEffect, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { fiveChainSections, sharedWalletAddress } from "../wallet-flow-fixtures";
import { WalletReceiveSheet } from "../wallet-receive-sheet";
import type { WalletReceiveSheetProps } from "../wallet-receive-sheet.types";

const meta = {
  title: "App/Wallet/WalletReceiveSheet",
  component: WalletReceiveSheet,
  args: { chainSections: fiveChainSections, defaultChainId: "tempo", onOpenChange: () => undefined, open: true, walletAddress: sharedWalletAddress },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof WalletReceiveSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

function StoryRender(props: WalletReceiveSheetProps) {
  const [open, setOpen] = createSignal(props.open);
  createEffect(() => props.open, (nextOpen) => { setOpen(nextOpen); });
  return <div class="min-h-screen bg-background p-6"><WalletReceiveSheet {...props} onOpenChange={setOpen} open={open()} /></div>;
}

export const DefaultDesktop: Story = { render: (args) => <StoryRender {...args} /> };
export const DefaultMobile: Story = { args: { forceMobile: true }, parameters: { viewport: { defaultViewport: "mobile1" } }, render: (args) => <StoryRender {...args} /> };
export const ChainSwitched: Story = {
  args: { defaultChainId: "story" },
  render: (args) => <StoryRender {...args} />,
  play: async () => {
    const body = within(document.body);
    const receiveDialog = await body.findByRole("dialog", { name: "Receive" });
    await expect(receiveDialog).toHaveTextContent("Story Aeneid");
  },
};
export const AllChainsSameAddress: Story = { args: { defaultChainId: "base" }, render: (args) => <StoryRender {...args} /> };
export const EmptyNoWallet: Story = { args: { chainSections: fiveChainSections.map((section) => ({ ...section, walletAddress: null })), walletAddress: null }, render: (args) => <StoryRender {...args} /> };
