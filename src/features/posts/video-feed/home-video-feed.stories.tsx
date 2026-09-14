/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

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

/**
 * The authenticated `/` configuration: no initial data, so the feed mounts
 * through its loader exactly as the route hands it `fetchHomeFeedPage`, and
 * the first page arrives from the load call.
 */
export const AuthenticatedLoader: Story = {
  name: "Authenticated loader",
  args: {
    data: undefined,
    loadPage: async () => publicFeedReviewPage,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvasElement.querySelector("main")?.getAttribute("data-video-feed-state")).toBe("ready"),
    );
    await expect(canvas.getByLabelText("Videos for you")).toBeInTheDocument();
  },
};

/** The initial load state before the first page resolves. */
export const Loading: Story = {
  args: { data: new Promise<FeedPage>(() => {}) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Loading videos")).toBeInTheDocument();
  },
};

/**
 * A failed first page keeps the surface honest instead of showing an empty
 * feed. The rejection is created inside the render so no rejected promise
 * exists at module scope, where it surfaces as an unhandled rejection on
 * sibling stories.
 */
export const FailedFirstPage: Story = {
  name: "Failed first page",
  render: () => (
    <HomeVideoFeed
      data={Promise.reject(new Error("feed unavailable"))}
      loadPage={async () => emptyPage}
      navigate={() => undefined}
    />
  ),
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

/** Uses the production prompt and feed; only document authority is a fixture. */
export const AdultViewing: Story = {
  args: {
    data: { ...emptyPage, ageLockedPositions: [0], nextCursor: null },
    verifyAge: async () => true,
    loadPage: async () => ({ ...publicFeedReviewPage, nextCursor: null }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole("button", { name: "Verify 18+ to view" });
    await expect(canvasElement.querySelector("video")).toBeNull();
    const region = canvas.getByRole("region", { name: "Videos for you" });
    await userEvent.click(button);
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Verify 18+ to view" })).toBeNull());
    await expect(canvas.getByRole("region", { name: "Videos for you" })).toBe(region);
    for (const video of canvasElement.querySelectorAll("video")) await expect(video.autoplay).toBe(false);
  },
};

/** Manual browser review of the same in-place flow before proof. */
export const AdultLocked: Story = { args: AdultViewing.args };
export const AdultCancelled: Story = {
  args: { ...AdultViewing.args, verifyAge: async () => false },
};
