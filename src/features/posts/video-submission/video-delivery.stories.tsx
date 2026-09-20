/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, waitFor } from "storybook/test";

import { reviewPlaybackMint, reviewPosterPath } from "../feed/public-feed-fixtures";
import { VideoPlayer } from "./video-player";

/**
 * The author-visible delivery surface. These states belong to the post and
 * creation views, not to public discovery: the feed never renders a video
 * that is still processing as an ordinary full-screen item.
 */
const meta = {
  title: "Screens/Posts/VideoDelivery",
  component: VideoPlayer,
  args: {
    mint: reviewPlaybackMint,
    postId: "post_harness_video_linked",
    posterPath: reviewPosterPath,
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof VideoPlayer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Playback and thumbnail are both still being prepared. */
export const AuthorPending: Story = {
  args: { state: { playback: "pending", thumbnail: "pending" } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent("Playback is being prepared.");
    await expect(canvasElement).toHaveTextContent("Thumbnail is being prepared.");
    await expect(canvasElement).not.toHaveTextContent("The post is published.");
    await expect(canvasElement.querySelector("video")).toBeNull();
  },
};

/** Playback failed and the thumbnail is unavailable. */
export const AuthorUnavailable: Story = {
  args: { state: { playback: "unavailable", thumbnail: "unavailable" } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent("Playback is unavailable.");
    await expect(canvasElement).toHaveTextContent("Thumbnail is unavailable.");
    await expect(canvasElement.querySelector("video")).toBeNull();
  },
};

/** Playback is ready and the sealed poster is available. */
export const AuthorPlayableWithPoster: Story = {
  args: { state: { playback: "ready", thumbnail: "ready" } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector("video")).not.toBeNull());
    await waitFor(() => expect(canvasElement.querySelector("video")?.getAttribute("poster")).toContain("poster"));
    await expect(canvasElement).not.toHaveTextContent("Playback is being prepared.");
  },
};

/** Playback is ready before its thumbnail: the player leads without a poster. */
export const AuthorMissingThumbnail: Story = {
  args: { state: { playback: "ready", thumbnail: "pending" } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.querySelector("video")).not.toBeNull());
    await expect(canvasElement.querySelector("video[poster]")).toBeNull();
    await expect(canvasElement).not.toHaveTextContent("Thumbnail is being prepared.");
  },
};
