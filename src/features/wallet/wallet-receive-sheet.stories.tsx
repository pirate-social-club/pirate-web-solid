import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { fiveChainSections, sharedWalletAddress } from "./wallet-flow-fixtures";
import { WalletReceiveSheet } from "./wallet-receive-sheet";
import type { WalletReceiveSheetProps } from "./wallet-receive-sheet.types";

const meta = {
  title: "Parts/Wallet/ReceiveSheet",
  component: WalletReceiveSheet,
  args: { chainSections: fiveChainSections, defaultChainId: "tempo", onOpenChange: () => undefined, open: true, walletAddress: sharedWalletAddress },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof WalletReceiveSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

function StoryRender(props: WalletReceiveSheetProps) {
  const [open, setOpen] = createSignal(true);
  return <div class="min-h-screen bg-background p-6"><WalletReceiveSheet {...props} onOpenChange={setOpen} open={open()} /></div>;
}

export const DefaultDesktop: Story = { render: (args) => <StoryRender {...args} /> };
export const DefaultMobile: Story = { args: { forceMobile: true }, globals: { viewport: { value: "mobile1", isRotated: false } }, render: (args) => <StoryRender {...args} /> };
export const ChainSwitched: Story = {
  args: { defaultChainId: "story" },
  render: (args) => <StoryRender {...args} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const dialog = await body.findByRole("dialog", { name: "Receive" }, { timeout: 5000 });
    await expect(within(dialog).getByText("Story Aeneid address")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: /Base Sepolia/ }));
    await expect(within(dialog).getByText("Base Sepolia address")).toBeInTheDocument();
  },
};
export const AllChainsSameAddress: Story = { args: { defaultChainId: "base" }, render: (args) => <StoryRender {...args} /> };
export const EmptyNoWallet: Story = { args: { chainSections: fiveChainSections.map((section) => ({ ...section, walletAddress: null })), walletAddress: null }, render: (args) => <StoryRender {...args} /> };
