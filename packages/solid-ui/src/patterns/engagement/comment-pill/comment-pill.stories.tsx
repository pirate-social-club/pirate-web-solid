import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { StoryRow } from "@/stories/lib/story-layout";
import { CommentPill } from "./comment-pill";

const meta = {
  title: "Patterns/Engagement/CommentPill",
  component: CommentPill,
  tags: ["autodocs"],
  args: {
    count: 24,
  },
  argTypes: {
    count: { control: "number" },
    onComment: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Comment count button for post surfaces. Emits `onComment`; the count is included in the accessible name so screen readers announce changes.",
      },
    },
  },
} satisfies Meta<typeof CommentPill>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pill = canvas.getByRole("button", { name: "Comments (24)" });
    await expect(pill).toBeVisible();
    await userEvent.click(pill);
    await expect(pill).toHaveFocus();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryRow>
      <CommentPill count={0} />
      <CommentPill count={8} />
      <CommentPill count={124} />
    </StoryRow>
  ),
};
