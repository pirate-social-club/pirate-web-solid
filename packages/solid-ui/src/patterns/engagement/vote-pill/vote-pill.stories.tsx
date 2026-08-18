import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { StoryRow } from "@/stories/lib/story-layout";
import { VotePill } from "./vote-pill";

const meta = {
  title: "Patterns/Engagement/VotePill",
  component: VotePill,
  tags: ["autodocs"],
  args: {
    score: 1240,
    viewerVote: null,
    busy: false,
    size: "default",
    variant: "pill",
    allowClear: false,
  },
  argTypes: {
    score: { control: "number" },
    viewerVote: { control: "select", options: [null, "up", "down"] },
    busy: { control: "boolean" },
    allowClear: { control: "boolean" },
    size: { control: "select", options: ["default", "compact"] },
    variant: { control: "select", options: ["pill", "bare"] },
    onVote: { table: { disable: true } },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Up/down vote control with a formatted score. `viewerVote`/`onVote` are controlled; `allowClear` lets a repeat press clear the vote, and `busy` disables both buttons. Pending votes show a decorative spinner in the pressed button. Score direction stays left-to-right by design.",
      },
    },
  },
} satisfies Meta<typeof VotePill>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    score: 18,
    viewerVote: "up",
    allowClear: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const upvote = canvas.getByRole("button", { name: "Upvote", pressed: true });
    await expect(upvote).toBeVisible();
    await userEvent.click(upvote);
    await expect(upvote).toHaveFocus();
  },
};

export const Variants: Story = {
  render: () => (
    <StoryRow>
      <VotePill score={18} />
      <VotePill score={321} viewerVote="up" />
      <VotePill score={-4} viewerVote="down" />
      <VotePill score={1200} viewerVote="up" />
    </StoryRow>
  ),
};

export const Sizes: Story = {
  render: () => (
    <StoryRow>
      <VotePill score={42} />
      <VotePill score={42} size="compact" />
      <VotePill score={42} variant="bare" />
      <VotePill score={42} size="compact" variant="bare" />
    </StoryRow>
  ),
};

export const Loading: Story = {
  args: {
    busy: true,
    score: 42,
  },
};
