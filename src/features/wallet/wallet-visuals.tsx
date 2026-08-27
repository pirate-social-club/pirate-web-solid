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

const fallbackColors = new Map([
  ["PATHUSD", "#334155"],
]);

const chainLabels = new Map<WalletHubChainId, string>([
  ["bitcoin", "BTC"],
  ["cosmos", "ATOM"],
  ["ethereum", "ETH"],
  ["base", "BASE"],
  ["optimism", "OP"],
  ["solana", "SOL"],
  ["story", "IP"],
  ["tempo", "T"],
]);

function VisualMark(props: { color: string; label: string; class?: string }) {
  return (
    <span
      aria-hidden="true"
      class={cn(
        "grid size-full place-items-center rounded-full text-center font-bold leading-none text-white",
        props.class,
      )}
      style={{
        background: props.color,
        "font-size": props.label.length > 3 ? "7px" : "9px",
      }}
    >
      {props.label}
    </span>
  );
}

function LocalIcon(props: { class?: string; src: string }) {
  return <img alt="" aria-hidden="true" class={cn("block size-full object-contain", props.class)} draggable={false} src={props.src} />;
}

function WalletIconFallback(props: { label: string; class?: string }) {
  const symbol = props.label.toUpperCase();
  const color = fallbackColors.get(symbol) ?? "#64748b";
  return <VisualMark class={props.class} color={color} label={symbol.slice(0, 4)} />;
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
    : <WalletIconFallback class="size-[74%]" label={chainLabels.get(props.chainId) ?? props.chainId} />;

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
          : <WalletIconFallback class={iconClass} label={symbol} />}
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
