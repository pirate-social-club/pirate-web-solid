import type { WalletHubChainSection } from "./wallet-hub.types";

export const sharedWalletAddress = "0xc74e2d06c9a7e304817b3c177b91e0c1f4873abc";

export const fiveChainSections: WalletHubChainSection[] = [
  {
    chainId: "ethereum", title: "Ethereum Sepolia", availability: "ready", walletAddress: sharedWalletAddress,
    tokens: [
      { id: "eth", symbol: "ETH", name: "Ether", balance: "0.1267", fiatValue: "$335.82" },
      { id: "usdc-eth", symbol: "USDC", name: "USD Coin", balance: "42.36", fiatValue: "$42.36" },
    ],
  },
  {
    chainId: "base", title: "Base Sepolia", availability: "ready", walletAddress: sharedWalletAddress,
    tokens: [
      { id: "base-eth", symbol: "ETH", name: "Ether", balance: "0.0364", fiatValue: "$96.46" },
      { id: "base-usdc", symbol: "USDC", name: "USD Coin", balance: "512.36", fiatValue: "$512.36" },
    ],
  },
  {
    chainId: "optimism", title: "Optimism Sepolia", availability: "ready", walletAddress: sharedWalletAddress,
    tokens: [{ id: "op-eth", symbol: "ETH", name: "Ether", balance: "0.2500", fiatValue: "$662.50" }],
  },
  {
    chainId: "story", title: "Story Aeneid", availability: "ready", walletAddress: sharedWalletAddress,
    tokens: [
      { id: "ip", symbol: "IP", name: "IP", balance: "96.40", fiatValue: "$173.52" },
      { id: "wip", symbol: "WIP", name: "Wrapped IP", balance: "18.20", fiatValue: "$32.76" },
    ],
  },
  {
    chainId: "tempo", title: "Tempo Moderato", availability: "ready", walletAddress: sharedWalletAddress,
    tokens: [{ id: "tempo-pathusd", symbol: "pathUSD", name: "pathUSD", balance: "1,204.11", fiatValue: "$1,204.11" }],
  },
];
