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

/**
 * A vote in flight: the pressed arrow turns into a spinner and both buttons
 * lock until the host settles the vote (this one never settles). The
 * component spins only the pressed direction; Paper draws both arrows as
 * spinners, which `busy` alone does not render.
 */
export const Loading: Story = {
  args: {
    score: 42,
    onVote: () => new Promise<void>(() => {}),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Upvote" }));
    const group = canvas.getByRole("button", { name: "Upvote" }).parentElement as HTMLElement;
    await expect(group).toHaveAttribute("aria-busy", "true");
    await expect(canvas.getByRole("button", { name: "Upvote" }).querySelector(".animate-spin")).not.toBeNull();
    await expect(canvas.getByRole("button", { name: "Upvote" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Downvote" })).toBeDisabled();
  },
};

/** Host-driven `busy`: both buttons disabled while the host is working. */
export const Busy: Story = {
  args: {
    busy: true,
    score: 42,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Upvote" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Downvote" })).toBeDisabled();
  },
};
