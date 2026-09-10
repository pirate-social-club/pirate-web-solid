/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, waitFor, within } from "storybook/test";

import { HomeVideoFeed } from "./home-video-feed";
import { publicFeedReviewPage } from "../feed/public-feed-fixtures";
import type { FeedPage } from "../feed/public-feed-adapter";

const emptyPage: FeedPage = { ...publicFeedReviewPage, items: [], topCommunities: [] };
const textOnlyPage: FeedPage = {
  ...publicFeedReviewPage,
  items: publicFeedReviewPage.items.filter(item => item.postType === "text"),
};

const meta = {
  title: "Screens/Posts/HomeVideoFeed",
  component: HomeVideoFeed,
  args: {
    data: publicFeedReviewPage,
    loadPage: async () => emptyPage,
    navigate: () => undefined,
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof HomeVideoFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The public-first `/` surface with a playable review video. */
export const Ready: Story = {
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(canvasElement.querySelector("main")?.getAttribute("data-video-feed-state")).toBe("ready"),
    );
  },
};

/** The initial load state before the first page resolves. */
export const Loading: Story = {
  args: { data: new Promise<FeedPage>(() => {}) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Loading videos")).toBeInTheDocument();
  },
};

/** A failed first page keeps the surface honest instead of showing an empty feed. */
export const FailedFirstPage: Story = {
  name: "Failed first page",
  args: { data: Promise.reject(new Error("feed unavailable")) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText("Video feed unavailable")).toBeInTheDocument());
  },
};

/** A feed with no video items says so rather than rendering an empty player. */
export const NoVideos: Story = {
  args: { data: textOnlyPage },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText("No videos yet")).toBeInTheDocument());
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
