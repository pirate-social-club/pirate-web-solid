export type WalletHubChainId =
  | "ethereum"
  | "base"
  | "optimism"
  | "story"
  | "tempo"
  | "solana"
  | "bitcoin"
  | "cosmos";

type WalletHubChainAvailability = "ready" | "later";

export interface WalletHubToken {
  id: string;
  symbol: string;
  name: string;
  balance?: string;
  fiatValue?: string;
  priceId?: string;
  usdPrice?: number | null;
}

export interface WalletHubChainSection {
  chainId: WalletHubChainId;
  title: string;
  availability: WalletHubChainAvailability;
  walletAddress?: string | null;
  tokens: WalletHubToken[];
  note?: string;
}

export interface WalletHubActivityItem {
  id: string;
  title: string;
  amount: string;
  timestamp?: string;
}

export interface WalletHubRewardsSummary {
  actionDisabled?: boolean;
  actionLabel: string;
  amountLabel: string;
  assetLabel: string;
  onAction?: () => void;
  pending?: boolean;
  supportingLabel?: string;
}

export interface WalletHubProps {
  variant?: "route" | "embedded";
  title?: string;
  walletLabel?: string;
  walletAddress?: string | null;
  walletActionsPending?: boolean;
  onChangeWallet?: () => void;
  totalBalanceUsd?: string | null;
  claimableWipWei?: string;
  claimableSalesCount?: number;
  claimLoading?: boolean;
  onClaim?: () => void;
  onReceive?: () => void;
  onSend?: () => void;
  onViewActivity?: () => void;
  rewardsSummary?: WalletHubRewardsSummary;
  chainSections: WalletHubChainSection[];
  recentActivity?: WalletHubActivityItem[];
}
