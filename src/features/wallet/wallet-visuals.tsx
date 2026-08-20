import {
  BadgedCircle,
  Type,
  cn,
} from "../../design-system";
import type { WalletHubChainId, WalletHubToken } from "./wallet-hub.types";

import baseIconUrl from "../../assets/wallet-icons/base.png";
import cosmosIconUrl from "../../assets/wallet-icons/cosmos.png";
import ethereumIconUrl from "../../assets/wallet-icons/ethereum.png";
import ipIconUrl from "../../assets/wallet-icons/ip.png";
import optimismIconUrl from "../../assets/wallet-icons/optimism.png";
import sentinelIconUrl from "../../assets/wallet-icons/sentinel.png";
import solanaIconUrl from "../../assets/wallet-icons/solana.png";
import storyIconUrl from "../../assets/wallet-icons/story.png";
import tempoIconUrl from "../../assets/wallet-icons/tempo.png";
import usdcIconUrl from "../../assets/wallet-icons/usdc.png";
import usdtIconUrl from "../../assets/wallet-icons/usdt.png";

const LOCAL_TOKEN_ICON_BY_SYMBOL = new Map([
  ["ATOM", cosmosIconUrl],
  ["ETH", ethereumIconUrl],
  ["IP", ipIconUrl],
  ["P2P", sentinelIconUrl],
  ["USDC", usdcIconUrl],
  ["USDT", usdtIconUrl],
  ["WETH", ethereumIconUrl],
]);

const LOCAL_CHAIN_ICON_BY_CHAIN_ID = new Map<WalletHubChainId, string>([
  ["base", baseIconUrl],
  ["cosmos", cosmosIconUrl],
  ["ethereum", ethereumIconUrl],
  ["optimism", optimismIconUrl],
  ["solana", solanaIconUrl],
  ["story", storyIconUrl],
  ["tempo", tempoIconUrl],
]);

const fallbackColors = new Map([
  ["BTC", "#f7931a"],
  ["DAI", "#f5ac37"],
  ["LINK", "#2a5ada"],
  ["SOL", "#14b8a6"],
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
    <svg aria-hidden="true" class={props.class ?? "size-full"} fill="none" viewBox="0 0 32 32">
      <circle cx="16" cy="16" fill={props.color} r="16" />
      <text
        dominant-baseline="central"
        fill="#ffffff"
        font-family="system-ui, sans-serif"
        font-size={props.label.length > 3 ? "7" : "9"}
        font-weight="700"
        text-anchor="middle"
        x="16"
        y="16"
      >
        {props.label}
      </text>
    </svg>
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
  const iconUrl = LOCAL_CHAIN_ICON_BY_CHAIN_ID.get(props.chainId);
  const content = iconUrl
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
  const iconUrl = LOCAL_TOKEN_ICON_BY_SYMBOL.get(symbol);
  const isSmall = props.size === "sm";
  const circleClass = isSmall ? "size-10" : "size-12";
  const iconClass = isSmall ? "size-7" : "size-8";
  const icon = (
    <span class={cn("grid place-items-center overflow-hidden rounded-full border border-border bg-white p-1", circleClass)}>
      {iconUrl ? <LocalIcon class={iconClass} src={iconUrl} /> : <WalletIconFallback class={iconClass} label={symbol} />}
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
