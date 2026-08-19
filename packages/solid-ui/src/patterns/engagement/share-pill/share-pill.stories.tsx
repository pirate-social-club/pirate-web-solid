import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { StoryRow } from "@/stories/lib/story-layout";
import { SharePill } from "./share-pill";

const meta = {
  title: "Patterns/Engagement/SharePill",
  component: SharePill,
  tags: ["autodocs"],
  args: { label: "Share" },
  argTypes: { onShare: { table: { disable: true } } },
} satisfies Meta<typeof SharePill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const share = canvas.getByRole("button", { name: "Share" });
    await expect(share).toBeVisible();
    await userEvent.click(share);
    await expect(share).toHaveFocus();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryRow>
      <SharePill />
      <SharePill label="Share post" />
    </StoryRow>
  ),
};
