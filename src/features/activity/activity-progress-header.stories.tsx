import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { ActivityProgressHeader } from "./activity-progress-header";

const meta = {
  title: "Parts/Activity/ProgressHeader",
  component: ActivityProgressHeader,
  args: {
    progressMax: 10,
    progressValue: 4,
    rewardLabel: "Earn 50 points",
    onExit: () => undefined,
  },
  parameters: {
    layout: "fullscreen",
    a11y: { test: "error" },
  },
  render: (args) => (
    <div class="bg-background text-foreground">
      <ActivityProgressHeader {...args} />
    </div>
  ),
} satisfies Meta<typeof ActivityProgressHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "In progress",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bar = canvas.getByRole("progressbar", { name: "Activity progress" });
    await expect(bar).toHaveAttribute("aria-valuenow", "4");
    await expect(bar).toHaveAttribute("aria-valuemax", "10");
  },
};

export const NotStarted: Story = {
  name: "Not started",
  args: { progressValue: 0 },
};

export const Complete: Story = {
  name: "Complete",
  args: { progressValue: 10 },
};

/** No reward attached, so the gift mark is absent rather than empty. */
export const WithoutReward: Story = {
  name: "Without a reward",
  args: { rewardLabel: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("img")).toBeNull();
  },
};

/**
 * The component clamps rather than trusting its inputs, so an out-of-range
 * value must not overflow the track or report a nonsensical aria-valuenow.
 */
export const OutOfRangeValue: Story = {
  name: "Value beyond the maximum",
  args: { progressValue: 99 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "10");
  },
};

export const Mobile: Story = {
  name: "Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
