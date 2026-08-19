import { createSignal } from "solid-js";
import type { JSX } from "@solidjs/web";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { StandardRoutePage } from "../../shell/page-shell/page-shell";
import { fiveChainSections, sharedWalletAddress } from "../wallet-flow-fixtures";
import { WalletHub } from "../wallet-hub";
import type { WalletHubProps } from "../wallet-hub.types";
import { WalletReceiveSheet } from "../wallet-receive-sheet";
import { WalletSendSheet } from "../wallet-send-sheet";

const baseArgs: WalletHubProps = {
  claimableWipWei: "12450000000000000000",
  walletAddress: sharedWalletAddress,
  totalBalanceUsd: "$27,910.97",
  onClaim: () => undefined,
  onReceive: () => undefined,
  onSend: () => undefined,
  onViewActivity: () => undefined,
  rewardsSummary: { actionLabel: "Claim", amountLabel: "$1.00", assetLabel: "", onAction: () => undefined },
  recentActivity: [
    { id: "act-1", title: "Midnight Waves sold", amount: "+$6.20", timestamp: "6m" },
    { id: "act-2", title: "Basement Session sold", amount: "+$4.00", timestamp: "48m" },
    { id: "act-3", title: "Claim confirmed", amount: "$10.20", timestamp: "1h" },
  ],
  chainSections: fiveChainSections,
};

const meta = {
  title: "App/Wallet/WalletHub",
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
    recentActivity: [{ id: "act-1", title: "Midnight Waves sold", amount: "+$6.20", timestamp: "6m" }],
    chainSections: [
      { chainId: "ethereum", title: "Ethereum", availability: "ready", tokens: [{ id: "eth", symbol: "ETH", name: "Ether", balance: "0.82", fiatValue: "$2,173.00" }, { id: "usdc-eth", symbol: "USDC", name: "USD Coin", balance: "96.00", fiatValue: "$96.00" }] },
      { chainId: "base", title: "Base", availability: "ready", tokens: [] },
      { chainId: "optimism", title: "Optimism", availability: "ready", tokens: [] },
      { chainId: "story", title: "Story", availability: "ready", tokens: [{ id: "ip", symbol: "IP", name: "Story Protocol", balance: "12.80", fiatValue: "$23.04" }] },
      { chainId: "tempo", title: "Tempo", availability: "later", tokens: [], note: "Coming soon" },
    ],
  },
  render: (args) => <StoryFrame><WalletHub {...args} /></StoryFrame>,
};

export const EmptyActivity: Story = { args: { recentActivity: [] }, render: (args) => <StoryFrame><WalletHub {...args} /></StoryFrame> };
export const Mobile: Story = { parameters: { viewport: { defaultViewport: "mobile1" } }, render: (args) => <StoryFrame><WalletHub {...args} /></StoryFrame> };
export const WithoutRewards: Story = { args: { rewardsSummary: undefined }, render: (args) => <StoryFrame><WalletHub {...args} /></StoryFrame> };
export const WithoutRewardsMobile: Story = { args: WithoutRewards.args, parameters: { viewport: { defaultViewport: "mobile1" } }, render: (args) => <StoryFrame><WalletHub {...args} /></StoryFrame> };

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
