import type { WalletHubAssetRow } from "./wallet-hub-model";

import baseIcon from "../../assets/wallet-icons/base.png";
import ethereumIcon from "../../assets/wallet-icons/ethereum.png";
import ipIcon from "../../assets/wallet-icons/ip.png";
import optimismIcon from "../../assets/wallet-icons/optimism.png";
import storyIcon from "../../assets/wallet-icons/story.png";
import tempoIcon from "../../assets/wallet-icons/tempo.png";
import usdcIcon from "../../assets/wallet-icons/usdc.png";

const tokenIcons: Record<string, string> = {
  ETH: ethereumIcon,
  IP: ipIcon,
  PATHUSD: usdcIcon,
  USDC: usdcIcon,
  WIP: ipIcon,
};

const chainIcons: Record<string, string> = {
  base: baseIcon,
  ethereum: ethereumIcon,
  optimism: optimismIcon,
  story: storyIcon,
  tempo: tempoIcon,
};

export function TokenChainIcon(props: { asset: Pick<WalletHubAssetRow, "chainId" | "symbol"> }) {
  const symbol = props.asset.symbol.toUpperCase();
  const tokenIcon = tokenIcons[symbol] ?? tokenIcons.ETH;
  const chainIcon = chainIcons[props.asset.chainId] ?? tokenIcon;

  return (
    <div class="relative size-10 shrink-0">
      <div class="grid size-10 place-items-center overflow-hidden rounded-full border border-border bg-white p-1">
        <img alt="" aria-hidden="true" class="size-full object-contain" draggable="false" src={tokenIcon} />
      </div>
      <span class="absolute -bottom-1 -end-1 grid size-5 place-items-center overflow-hidden rounded-full border-2 border-card bg-white p-0.5">
        <img alt="" aria-hidden="true" class="size-full object-contain" draggable="false" src={chainIcon} />
      </span>
    </div>
  );
}

export function ChainIcon(props: { chainId: string; class?: string }) {
  const chainIcon = chainIcons[props.chainId] ?? ethereumIcon;

  return <img alt="" aria-hidden="true" class={props.class ?? "size-8 object-contain"} draggable="false" src={chainIcon} />;
}
