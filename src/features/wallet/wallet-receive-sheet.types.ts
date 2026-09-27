import type { WalletHubChainId, WalletHubChainSection } from "./wallet-hub.types";

export interface WalletReceiveSheetProps {
  chainSections: WalletHubChainSection[];
  defaultChainId?: WalletHubChainId;
  forceMobile?: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  walletAddress?: string | null;
}
