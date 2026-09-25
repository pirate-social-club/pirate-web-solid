/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { HomeVideoFeed } from "./home-video-feed";
import {
  publicFeedProcessingPage,
  publicFeedReviewPage,
  reviewPlaybackMint,
  reviewPosterPath,
  reviewSongLinks,
} from "../feed/public-feed-fixtures";
import type { FeedPage, PublicFeedItem } from "../feed/public-feed-adapter";

const emptyPage: FeedPage = { ...publicFeedReviewPage, items: [], topCommunities: [] };
const textOnlyPage: FeedPage = {
  ...publicFeedReviewPage,
  items: publicFeedReviewPage.items.filter(item => item.postType === "text"),
};
const reviewVideo = publicFeedReviewPage.items[0]!;
const oneVideo = (item: PublicFeedItem): FeedPage => ({ items: [item], topCommunities: [], nextCursor: null });

const playableLinked: PublicFeedItem = { ...reviewVideo, songPostId: "post_harness_song", songTitle: "Harbor lights" };
const playableUnlinked: PublicFeedItem = {
  ...reviewVideo,
  id: "review-post-unlinked",
  caption: "A video with its own sound.",
  songPostId: null,
};
const missingThumbnail: PublicFeedItem = {
  ...playableLinked,
  videoDelivery: { playback: "ready", thumbnail: "pending" },
};

/**
 * Storybook has no harness host mapping, so the local fixture's media never
 * attaches. This seam reports loaded metadata so the feed's own player reaches
 * its ready state and the full-screen layout can be reviewed.
 */
const loadedAttach = async (input: { video: HTMLVideoElement }) => {
  input.video.dispatchEvent(new Event("loadedmetadata"));
  return () => {};
};

const meta = {
  title: "Screens/Posts/HomeVideoFeed",
  component: HomeVideoFeed,
  args: {
    data: publicFeedReviewPage,
    loadPage: async () => emptyPage,
    navigate: () => undefined,
    // The local review fixture plays its own media and resolves its own song
    // link; production keeps the API mint, poster and public read.
    attachPlayback: loadedAttach,
    mintPlaybackAccess: reviewPlaybackMint,
    posterPath: reviewPosterPath,
    resolveSongLink: reviewSongLinks,
    studyReady: async (): Promise<boolean> => false,
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof HomeVideoFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

const readyState = async (canvasElement: HTMLElement): Promise<void> => {
  await waitFor(() =>
    expect(canvasElement.querySelector("main")?.getAttribute("data-video-feed-state")).toBe("ready"),
  );
};

/**
 * The primary review fixture: a playable video linked to its song, in the
 * feed's full-screen layout with its action rail and soundtrack line. No
 * status text, native controls or extra buttons.
 */
export const PlayableLinked: Story = {
  args: { data: oneVideo(playableLinked) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    await waitFor(() => expect(canvasElement.querySelectorAll("[data-media-post]")).toHaveLength(1));
    await expect(canvas.getByRole("button", { name: /Harbor lights/ })).toBeInTheDocument();
    await expect(canvasElement).toHaveTextContent("A sovereign town square for communities");
    await expect(canvasElement).not.toHaveTextContent(/Preparing playback|View post|Study/);
    await expect(canvasElement.querySelector("video")?.hasAttribute("controls")).toBe(false);
  },
};

/**
 * A video whose song is ready to study and has aligned lyrics: Study and
 * Karaoke sit in the rail above the soundtrack button and open the song's
 * own pages.
 */
export const SongActivities: Story = {
  args: {
    data: oneVideo(playableLinked),
    studyReady: async () => true,
    resolveSongLink: async (attribution) => ({
      ...(await reviewSongLinks(attribution))!,
      activityPaths: { study: "/p/harbor-lights/study", karaoke: "/p/harbor-lights/karaoke" },
      karaokeReady: true,
    }),
    navigate: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    const karaoke = await canvas.findAllByRole("button", { name: "Karaoke" });
    await expect(canvas.getAllByRole("button", { name: "Study" }).length).toBeGreaterThan(0);
    await userEvent.click(karaoke[0]!);
    await expect(args.navigate).toHaveBeenCalledWith("/p/harbor-lights/karaoke");
  },
};

/** A playable video with its own sound carries no soundtrack line. */
export const PlayableUnlinked: Story = {
  args: { data: oneVideo(playableUnlinked) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    await waitFor(() => expect(canvasElement.querySelectorAll("[data-media-post]")).toHaveLength(1));
    await expect(canvas.queryByRole("button", { name: /Harbor lights/ })).toBeNull();
    await expect(canvasElement).toHaveTextContent("A video with its own sound.");
  },
};

/** Playback ready with the thumbnail still processing: the video leads, no poster. */
export const MissingThumbnail: Story = {
  args: { data: oneVideo(missingThumbnail) },
  play: async ({ canvasElement }) => {
    await readyState(canvasElement);
    await waitFor(() => expect(canvasElement.querySelectorAll("[data-media-post]")).toHaveLength(1));
    await expect(canvasElement.querySelector("[data-media-post] img")).toBeNull();
  },
};

/** Muted first, as browsers require for autoplay; the mute control unmutes. */
export const MuteControlPolicy: Story = {
  name: "Mute control policy",
  args: { data: oneVideo(playableLinked) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    const player = await waitFor(() => { const video = canvasElement.querySelector("video"); expect(video).not.toBeNull(); return video!; });
    await waitFor(() => expect(player.muted).toBe(true));
    await userEvent.click(canvas.getByRole("button", { name: "Unmute video" }));
    await waitFor(() => expect(player.muted).toBe(false));
    await expect(canvas.getByRole("button", { name: "Mute video" })).toHaveAttribute("aria-pressed", "false");
  },
};

/**
 * Author-visible processing states. The public feed never renders a video
 * that is still being prepared as an ordinary full-screen item; these states
 * belong to the post surface, where the author follows recovery.
 */
export const AuthorProcessingHiddenFromFeed: Story = {
  args: { data: publicFeedProcessingPage },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    await expect(canvasElement.querySelectorAll("[data-media-post]")).toHaveLength(0);
    await expect(canvas.getByText("Videos are being prepared")).toBeInTheDocument();
  },
};

/** The authenticated `/` configuration: no initial data, so the loader runs. */
export const AuthenticatedLoader: Story = {
  name: "Authenticated loader",
  args: {
    data: undefined,
    loadPage: async () => publicFeedReviewPage,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
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

/** The playable linked fixture on a mobile viewport with the footer tab bar. */
export const MobilePlayableLinked: Story = {
  name: "Mobile playable linked",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  args: { data: oneVideo(playableLinked) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    await waitFor(() => expect(canvasElement.querySelector('[data-media-post="review-post-video"]')).not.toBeNull());
    await expect(canvas.getByRole("button", { name: /Harbor lights/ })).toBeVisible();
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
    button.click();
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Verify 18+ to view" })).toBeNull());
    await expect(canvas.getByRole("region", { name: "Videos for you" })).toBe(region);
    for (const video of canvasElement.querySelectorAll("video")) await expect(video.autoplay).toBe(false);
  },
};

/** Manual browser review of the same in-place flow before proof. */
export const AdultLocked: Story = { args: AdultViewing.args };
