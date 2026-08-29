import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { VideoFeedKaraokeCta } from "./video-feed-karaoke-cta";

const song = {
  artist: "Tame Impala",
  karaokeHref: "/p/post_1/karaoke",
  title: "Apocalypse Dreams",
};

const meta = {
  title: "Parts/Posts/VideoFeedKaraokeCta",
  component: VideoFeedKaraokeCta,
  args: {
    item: { karaoke: "ready", rewards: undefined, song },
    onNavigate: () => undefined,
  },
  parameters: { layout: "centered", a11y: { test: "error" } },
} satisfies Meta<typeof VideoFeedKaraokeCta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Ready",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Sing" })).toBeInTheDocument();
  },
};

/** A reward on the feed item promotes the label from "Sing" to the amount. */
export const WithReward: Story = {
  name: "With a reward",
  args: {
    item: {
      karaoke: "ready",
      rewards: { karaoke: { amountLabel: "0.50 USDC" } },
      song,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Sing · 0.50 USDC" })).toBeInTheDocument();
  },
};

/**
 * The CTA is capability-gated by the feed item. Neither an unready karaoke
 * state nor a missing href may render a control that leads nowhere.
 */
export const NotReady: Story = {
  name: "Karaoke still processing",
  args: { item: { karaoke: "processing", rewards: undefined, song } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};

export const WithoutHref: Story = {
  name: "Ready but no karaoke href",
  args: { item: { karaoke: "ready", rewards: undefined, song: undefined } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};
