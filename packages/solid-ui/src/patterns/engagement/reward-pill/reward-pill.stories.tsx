import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { CommentPill } from "../comment-pill/comment-pill";
import { VotePill } from "../vote-pill/vote-pill";
import { RewardPill } from "./reward-pill";

const meta = {
  title: "Patterns/Engagement/RewardPill",
  component: RewardPill,
  tags: ["autodocs"],
  args: {
    activityCount: 3,
  },
  argTypes: {
    activityCount: { control: "number" },
    onOpen: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "The third pill on a song or video post: a gift mark and how many activities the song offers. It is not money and never says the viewer has earned anything. Emits `onOpen`, which opens the song's rewards sheet. Stateless fixture: the app has no activity-count projection and Rewards are disabled, so no live feed renders it yet. Loading and unavailable looks are not designed.",
      },
    },
  },
} satisfies Meta<typeof RewardPill>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pill = canvas.getByRole("button", { name: "Rewards (3 activities)" });
    await expect(pill).toBeVisible();
    await userEvent.click(pill);
    await expect(pill).toHaveFocus();
  },
};

/** In place: a song post's action row, and a text post's row without it. */
export const InPlace: Story = {
  render: () => (
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-2 pt-1" role="group" aria-label="Song post actions">
        <VotePill score={18} />
        <CommentPill count={24} />
        <RewardPill activityCount={3} />
      </div>
      <div class="flex items-center gap-2 pt-1" role="group" aria-label="Text post actions">
        <VotePill score={18} />
        <CommentPill count={24} />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(within(canvas.getByRole("group", { name: "Song post actions" })).getByRole("button", { name: /^Rewards/ })).toBeVisible();
    await expect(within(canvas.getByRole("group", { name: "Text post actions" })).queryByRole("button", { name: /^Rewards/ })).toBeNull();
  },
};
