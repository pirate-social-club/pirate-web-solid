import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect } from "storybook/test";

import { TokenChainIcon } from "./wallet-visuals";

const meta = {
  title: "Parts/Wallet/TokenChainIcon",
  component: TokenChainIcon,
  tags: ["autodocs"],
  args: {
    chainId: "solana",
    chainLabel: "Solana",
    showChainBadge: true,
    size: "md",
    token: { name: "Solana", symbol: "SOL" },
  },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The token mark and chain badge used in wallet holdings. This story keeps two SOL holdings on the same page so SVG references remain safe when the real wallet and an open sheet are both visible.",
      },
    },
  },
} satisfies Meta<typeof TokenChainIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoSolanaInstances: Story = {
  render: (args) => (
    <div class="flex items-center gap-4 rounded-[var(--radius-lg)] border border-border-soft bg-card p-6">
      <TokenChainIcon {...args} />
      <TokenChainIcon {...args} />
    </div>
  ),
  play: ({ canvasElement }) => {
    const ids = [...canvasElement.querySelectorAll<HTMLElement>("[id]")].map((element) => element.id);
    const references = [...canvasElement.querySelectorAll<SVGElement>("[fill]")]
      .map((element) => element.getAttribute("fill"))
      .flatMap((fill) => {
        const match = fill?.match(/^url\(#(.+)\)$/);
        return match ? [match[1]] : [];
      });

    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const reference of references) expect(ids).toContain(reference);
  },
};

export const TokenIdentityFallback: Story = {
  render: () => (
    <div class="flex items-center gap-4 rounded-[var(--radius-lg)] border border-border-soft bg-card p-6">
      <TokenChainIcon
        chainId="ethereum"
        showChainBadge={false}
        size="md"
        token={{ name: "PathUSD", symbol: "PATHUSD" }}
      />
    </div>
  ),
};
