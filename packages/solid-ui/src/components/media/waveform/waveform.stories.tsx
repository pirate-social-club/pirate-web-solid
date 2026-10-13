import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { StoryStack } from "@/stories/lib/story-layout";
import { boardWidth, widthOf } from "@/stories/lib/story-measure";
import { Waveform } from "./waveform";

const meta = {
  title: "Components/Media/Waveform",
  component: Waveform,
  tags: ["autodocs"],
  args: {
    seed: "midnight-waves",
    progressFraction: 0.28,
  },
  argTypes: {
    seed: { control: "text" },
    progressFraction: { control: { type: "number", min: 0, max: 1, step: 0.01 } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Deterministic seeded bar visualization. Peaks come from an explicit `peaks` array or are generated from `seed`; bars up to `progressFraction` are tinted as played. Purely decorative (`aria-hidden`), so playback state must be conveyed elsewhere.",
      },
    },
  },
} satisfies Meta<typeof Waveform>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div
      class="w-[36rem] max-w-full rounded-[var(--radius-lg)] border border-border-soft bg-card p-5"
      data-testid="waveform-card"
    >
      <Waveform {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryAllByRole("img")).toHaveLength(0);
    // Paper: a 576px card whose 72 bars draw at their full 2px width.
    const card = canvas.getByTestId("waveform-card");
    await expect(widthOf(card)).toBe(boardWidth(576));
    const bars = Array.from(card.querySelectorAll("[aria-hidden=true] > span"));
    await expect(bars).toHaveLength(72);
    if (boardWidth(576) === 576) {
      for (const bar of bars) await expect(bar.getBoundingClientRect().width).toBe(2);
    }
  },
};

export const Variants: Story = {
  render: () => (
    <StoryStack class="w-[36rem] max-w-full">
      <div class="rounded-[var(--radius-lg)] border border-border-soft bg-card p-5">
        <Waveform
          peaks={[0.18, 0.42, 0.7, 0.35, 0.88, 0.54, 0.3, 0.62, 0.22, 0.76, 0.48, 0.31]}
          progressFraction={0.5}
          seed="explicit-peaks"
        />
      </div>
      <div class="rounded-[var(--radius-lg)] border border-border-soft bg-card p-5">
        <Waveform progressFraction={0} seed="not-started" />
      </div>
    </StoryStack>
  ),
  play: async ({ canvasElement }) => {
    const cards = Array.from(canvasElement.querySelectorAll(".bg-card"));
    await expect(cards).toHaveLength(2);
    for (const card of cards) await expect(widthOf(card)).toBe(boardWidth(576));
  },
};
