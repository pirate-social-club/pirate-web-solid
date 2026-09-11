import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { ActivityProgressHeader } from "./activity-progress-header";

const meta = {
  title: "Parts/Activity/ProgressHeader",
  component: ActivityProgressHeader,
  args: {
    progressMax: 10,
    progressValue: 4,
    rewardLabel: "Earn $0.40",
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

/** No reward attached, so the gift mark is absent rather than empty. */
export const WithoutReward: Story = {
  name: "Without a reward",
  args: { rewardLabel: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("img")).toBeNull();
  },
};
