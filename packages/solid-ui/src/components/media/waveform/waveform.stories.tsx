import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { StoryStack } from "@/stories/lib/story-layout";
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
    <div class="max-w-xl rounded-[var(--radius-lg)] border border-border-soft bg-card p-5">
      <Waveform {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryAllByRole("img")).toHaveLength(0);
  },
};

export const Variants: Story = {
  render: () => (
    <StoryStack class="max-w-xl">
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
};
