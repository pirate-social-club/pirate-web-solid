import { Dynamic } from "@solidjs/web";
import type { Component } from "solid-js";

import {
  BadgedCircle,
  NetworkBase,
  NetworkBitcoin,
  NetworkEthereum,
  NetworkOptimism,
  NetworkTempo,
  TokenBTC,
  TokenDAI,
  TokenETH,
  TokenLINK,
  TokenSOL,
  TokenUSDC,
  TokenUSDT,
  IconWallet,
  type Web3IconProps,
  cn,
} from "../../design-system";
import type { WalletHubChainId, WalletHubToken } from "./wallet-hub.types";

import cosmosIconUrl from "../../assets/wallet-icons/cosmos.png";
import ipIconUrl from "../../assets/wallet-icons/ip.png";
import sentinelIconUrl from "../../assets/wallet-icons/sentinel.png";
import solanaIconUrl from "../../assets/wallet-icons/solana.png";
import storyIconUrl from "../../assets/wallet-icons/story.png";

type Web3IconComponent = Component<Web3IconProps>;

const LOCAL_TOKEN_ICON_BY_SYMBOL = new Map([
  ["ATOM", cosmosIconUrl],
  ["IP", ipIconUrl],
  ["P2P", sentinelIconUrl],
]);

const LOCAL_CHAIN_ICON_BY_CHAIN_ID = new Map<WalletHubChainId, string>([
  ["cosmos", cosmosIconUrl],
  ["solana", solanaIconUrl],
  ["story", storyIconUrl],
]);

const WEB3_TOKEN_ICON_BY_SYMBOL = new Map<string, Web3IconComponent>([
  ["BTC", TokenBTC],
  ["DAI", TokenDAI],
  ["ETH", TokenETH],
  ["LINK", TokenLINK],
  ["SOL", TokenSOL],
  ["USDC", TokenUSDC],
  ["USDT", TokenUSDT],
  ["WBTC", TokenBTC],
  ["WETH", TokenETH],
]);

const WEB3_CHAIN_ICON_BY_CHAIN_ID = new Map<WalletHubChainId, Web3IconComponent>([
  ["base", NetworkBase],
  ["bitcoin", NetworkBitcoin],
  ["ethereum", NetworkEthereum],
  ["optimism", NetworkOptimism],
  ["tempo", NetworkTempo],
]);

function LocalIcon(props: { class?: string; src: string }) {
  return <img alt="" aria-hidden="true" class={cn("block size-full object-contain", props.class)} draggable={false} src={props.src} />;
}

function WalletIconFallback(props: { class?: string }) {
  return <IconWallet aria-hidden="true" class={props.class ?? "size-full"} />;
}

export function ChainIcon(props: {
  chainId: WalletHubChainId;
  class?: string;
  framed?: boolean;
}) {
  const web3Icon = WEB3_CHAIN_ICON_BY_CHAIN_ID.get(props.chainId);
  const iconUrl = LOCAL_CHAIN_ICON_BY_CHAIN_ID.get(props.chainId);
  const content = web3Icon
    ? <Dynamic component={web3Icon} class="size-[74%]" />
    : iconUrl
    ? <LocalIcon class="size-[74%]" src={iconUrl} />
    : <WalletIconFallback class="size-[74%]" />;

  if (props.framed === false) {
    return <span class={cn("grid shrink-0 place-items-center", props.class)}>{content}</span>;
  }

  return <span class={cn("grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-white", props.class)}>{content}</span>;
}

export function TokenChainIcon(props: {
  chainId: WalletHubChainId;
  chainLabel?: string;
  showChainBadge?: boolean;
  token: Pick<WalletHubToken, "name" | "symbol">;
  size?: "sm" | "md";
}) {
  const symbol = props.token.symbol.toUpperCase();
  const web3Icon = WEB3_TOKEN_ICON_BY_SYMBOL.get(symbol);
  const iconUrl = LOCAL_TOKEN_ICON_BY_SYMBOL.get(symbol);
  const isSmall = props.size === "sm";
  const circleClass = isSmall ? "size-10" : "size-12";
  const iconClass = isSmall ? "size-7" : "size-8";
  const icon = (
    <span class={cn("grid place-items-center overflow-hidden rounded-full border border-border bg-white p-1", circleClass)}>
      {web3Icon
        ? <Dynamic component={web3Icon} class={iconClass} />
        : iconUrl
          ? <LocalIcon class={iconClass} src={iconUrl} />
          : <WalletIconFallback class={iconClass} />}
    </span>
  );

  if (!props.showChainBadge) return icon;

  return (
    <BadgedCircle
      badge={<ChainIcon chainId={props.chainId} class="size-4" framed={false} />}
      badgeLabel={props.chainLabel ? `${props.chainLabel} chain` : undefined}
      badgeFrameClassName="border border-white/70"
      badgePadding={2}
      badgeSize={isSmall ? 16 : 18}
      class={circleClass}
    >
      {icon}
    </BadgedCircle>
  );
}
