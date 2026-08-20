import { createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { StandardRoutePage } from "../shell/page-shell/page-shell";
import { fiveChainSections, sharedWalletAddress } from "./wallet-flow-fixtures";
import { WalletHub } from "./wallet-hub";
import type { WalletHubProps } from "./wallet-hub.types";
import { WalletReceiveSheet } from "./wallet-receive-sheet";
import { WalletSendSheet } from "./wallet-send-sheet";

const baseArgs: WalletHubProps = {
  claimableDataWei: "12450000000000000000",
  claimableSalesCount: 2,
  walletLabel: "View your money.",
  walletAddress: sharedWalletAddress,
  totalBalanceUsd: "$27,910.97",
  onReceive: () => undefined,
  onSend: () => undefined,
  chainSections: fiveChainSections,
};

const meta = {
  title: "Compositions/Wallet/WalletHub",
  component: WalletHub,
  args: baseArgs,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof WalletHub>;

export default meta;
type Story = StoryObj<typeof meta>;

function StoryFrame(props: { children: JSX.Element }) {
  return <div class="min-h-screen bg-background"><StandardRoutePage size="rail">{props.children}</StandardRoutePage></div>;
}

export const Default: Story = { render: (args) => <StoryFrame><WalletHub {...args} /></StoryFrame> };

export const Deferred: Story = {
  args: {
    walletLabel: "View your money.",
    chainSections: [
      { chainId: "ethereum", title: "Ethereum", availability: "ready", tokens: [{ id: "eth", symbol: "ETH", name: "Ether", balance: "0.82" }, { id: "usdc-eth", symbol: "USDC", name: "USD Coin", balance: "96.00" }] },
      { chainId: "base", title: "Base", availability: "ready", tokens: [] },
      { chainId: "optimism", title: "Optimism", availability: "ready", tokens: [] },
      { chainId: "story", title: "Story", availability: "ready", tokens: [{ id: "ip", symbol: "IP", name: "Story Protocol", balance: "12.80" }] },
      { chainId: "tempo", title: "Tempo", availability: "later", tokens: [], note: "Coming soon" },
    ],
  },
  render: (args) => <StoryFrame><WalletHub {...args} /></StoryFrame>,
};

export const EmptyAssets: Story = { args: { chainSections: [], claimableDataWei: undefined, claimableSalesCount: undefined, totalBalanceUsd: null }, render: (args) => <StoryFrame><WalletHub {...args} /></StoryFrame> };
export const Mobile: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: (args) => <StoryFrame><WalletHub {...args} /></StoryFrame> };
export const Bounties: Story = { args: { rewardsSummary: { actionLabel: "Claim", amountLabel: "$1.00", assetLabel: "", onAction: () => undefined } }, render: (args) => <StoryFrame><WalletHub {...args} /></StoryFrame> };
export const BountiesMobile: Story = { args: Bounties.args, parameters: { viewport: { defaultViewport: "mobile1" } }, render: (args) => <StoryFrame><WalletHub {...args} /></StoryFrame> };

function WalletHubWithSheets(props: { forceMobile?: boolean }) {
  const [walletAction, setWalletAction] = createSignal<"send" | "receive" | null>(null);
  return (
    <StoryFrame>
      <WalletHub {...baseArgs} onReceive={() => setWalletAction("receive")} onSend={() => setWalletAction("send")} />
      <WalletReceiveSheet chainSections={fiveChainSections} defaultChainId="tempo" forceMobile={props.forceMobile} onOpenChange={(open) => setWalletAction(open ? "receive" : null)} open={walletAction() === "receive"} walletAddress={sharedWalletAddress} />
      <WalletSendSheet chainSections={fiveChainSections} defaultAssetId="base:base-usdc" forceMobile={props.forceMobile} onOpenChange={(open) => setWalletAction(open ? "send" : null)} open={walletAction() === "send"} />
    </StoryFrame>
  );
}

export const WithSendReceiveSheets: Story = { render: () => <WalletHubWithSheets /> };
export const WithSheetsMobile: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <WalletHubWithSheets forceMobile /> };
