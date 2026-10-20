import type { WalletHubChainSection } from "./wallet-hub.types";

export interface WalletReceiveSheetProps {
  chainSections: WalletHubChainSection[];
  forceMobile?: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  walletAddress?: string | null;
}
