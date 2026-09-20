/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { HomeVideoFeed } from "./home-video-feed";
import {
  publicFeedProcessingPage,
  publicFeedReviewPage,
  reviewPlaybackMint,
  reviewPosterPath,
  reviewSongLinks,
} from "../feed/public-feed-fixtures";
import type { FeedPage, PublicFeedItem } from "../feed/public-feed-adapter";
import { createSignal } from "solid-js";
import { makeStudyAvailabilityLookup } from "./home-feed-study";

const emptyPage: FeedPage = { ...publicFeedReviewPage, items: [], topCommunities: [] };
const textOnlyPage: FeedPage = {
  ...publicFeedReviewPage,
  items: publicFeedReviewPage.items.filter(item => item.postType === "text"),
};
const reviewVideo = publicFeedReviewPage.items[0]!;
const oneVideo = (item: PublicFeedItem): FeedPage => ({ items: [item], topCommunities: [], nextCursor: null });

const playableLinked: PublicFeedItem = { ...reviewVideo, songPostId: "post_harness_song" };
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

const meta = {
  title: "Screens/Posts/HomeVideoFeed",
  component: HomeVideoFeed,
  args: {
    data: publicFeedReviewPage,
    loadPage: async () => emptyPage,
    navigate: () => undefined,
    // The local review fixture plays its own media and resolves its own song
    // link; production keeps the API mint, poster and public read.
    loadStudyAvailability: async (songPostId: string) => songPostId === "post_harness_song",
    mintPlaybackAccess: reviewPlaybackMint,
    posterPath: reviewPosterPath,
    resolveSongLink: reviewSongLinks,
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

/** The primary review fixture: a playable local video linked to its song. */
export const PlayableLinked: Story = {
  args: { data: oneVideo(playableLinked) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    await expect(canvasElement.querySelectorAll("[data-video-feed-card]")).toHaveLength(1);
    await expect(canvas.getByRole("link", { name: "Study" })).toHaveAttribute("href", "/p/post_harness_song/study");
    await expect(canvasElement).toHaveTextContent("A sovereign town square for communities");
  },
};

/** A playable video with original audio carries no Study action. */
export const PlayableUnlinked: Story = {
  args: { data: oneVideo(playableUnlinked) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    await expect(canvasElement.querySelectorAll("[data-video-feed-card]")).toHaveLength(1);
    await expect(canvas.queryByRole("link", { name: "Study" })).toBeNull();
    await expect(canvasElement).toHaveTextContent("A video with its own sound.");
  },
};

/** The referenced song's Study availability is ready, so the action appears. */
export const StudyReady: Story = {
  args: { data: oneVideo(playableLinked) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    await expect(await canvas.findByRole("link", { name: "Study" })).toBeInTheDocument();
  },
};

/** An unavailable referenced song renders the card without a Study action. */
export const StudyUnavailable: Story = {
  args: { data: oneVideo(playableLinked), loadStudyAvailability: async () => false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    await expect(canvasElement.querySelectorAll("[data-video-feed-card]")).toHaveLength(1);
    await expect(canvas.queryByRole("link", { name: "Study" })).toBeNull();
  },
};

/** A slow availability read stays hidden rather than showing a disabled action. */
export const StudyLoading: Story = {
  args: { data: oneVideo(playableLinked), loadStudyAvailability: () => new Promise<boolean>(() => {}) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    await expect(canvas.queryByRole("link", { name: "Study" })).toBeNull();
  },
};

/** A failed availability read fails closed: no Study action. */
export const StudyError: Story = {
  args: {
    data: oneVideo(playableLinked),
    loadStudyAvailability: async () => { throw new Error("availability unavailable"); },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    await expect(canvas.queryByRole("link", { name: "Study" })).toBeNull();
  },
};

/** Playback ready with the thumbnail still processing: the video leads. */
export const MissingThumbnail: Story = {
  args: { data: oneVideo(missingThumbnail) },
  play: async ({ canvasElement }) => {
    await readyState(canvasElement);
    await expect(canvasElement.querySelectorAll("[data-video-feed-card]")).toHaveLength(1);
    await expect(canvasElement.querySelector("video[poster]")).toBeNull();
    await expect(canvasElement).not.toHaveTextContent("Thumbnail is being prepared.");
  },
};

/** The mint is still in flight: the player shows its own loading line. */
export const PlaybackLoading: Story = {
  args: { data: oneVideo(playableLinked), mintPlaybackAccess: () => new Promise(() => {}) },
  play: async ({ canvasElement }) => {
    await readyState(canvasElement);
    await waitFor(() =>
      expect(canvasElement.querySelector("[data-video-player-state]")?.getAttribute("data-video-player-state")).toBe("loading"),
    );
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Preparing playback");
  },
};

/** Denied playback access surfaces the retry path and never a fake source. */
export const PlaybackDenied: Story = {
  args: {
    data: oneVideo(playableLinked),
    mintPlaybackAccess: async () => { throw new Error("playback denied"); },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    await waitFor(() =>
      expect(canvasElement.querySelector("[data-video-player-state]")?.getAttribute("data-video-player-state")).toBe("unavailable"),
    );
    await expect(canvas.getByRole("button", { name: "Try playback again" })).toBeInTheDocument();
    await expect(canvasElement.querySelector("video")?.getAttribute("src")).toBeNull();
  },
};

/** A media transport failure lands in the same honest recovery state. */
export const PlaybackFailure: Story = {
  args: {
    data: oneVideo(playableLinked),
    attachPlayback: async () => { throw new Error("transport failed"); },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    await waitFor(() =>
      expect(canvasElement.querySelector("[data-video-player-state]")?.getAttribute("data-video-player-state")).toBe("unavailable"),
    );
    await expect(canvas.getByText(/Playback is unavailable/)).toBeInTheDocument();
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
    await expect(canvasElement.querySelectorAll("[data-video-feed-card]")).toHaveLength(0);
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
    await expect(canvas.getByRole("link", { name: "Study" })).toBeVisible();
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

/** The feed mute control is one policy for every playable card. */
export const MuteControlPolicy: Story = {
  name: "Mute control policy",
  args: { data: oneVideo(playableLinked) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    const player = canvasElement.querySelector("video");
    expect(player?.muted).toBe(false);
    await userEvent.click(canvas.getByRole("button", { name: "Mute" }));
    await waitFor(() => expect(player?.muted).toBe(true));
    await expect(canvas.getByRole("button", { name: "Unmute" })).toHaveAttribute("aria-pressed", "true");
  },
};

/**
 * Availability is scoped to the viewer: an anonymous miss does not survive
 * sign-in, and the action appears once the authenticated read answers.
 */
export const StudyAfterSignIn: Story = {
  name: "Study after sign-in",
  render: () => {
    const [identity, setIdentity] = createSignal("anonymous");
    const availability = makeStudyAvailabilityLookup({
      loadAvailability: async () => ({
        availability: identity() === "anonymous"
          ? { reason: "insufficient_exercises" as const, state: "unavailable" as const }
          : {
            available_exercise_types: ["say_it_back"],
            learner_bands: [],
            learning_language: "en",
            state: "ready" as const,
            target_languages: [],
          },
        communityId: "community-study",
      }),
    });
    return (
      <div>
        <button data-story-sign-in type="button" onClick={() => setIdentity("user:one")}>Sign in</button>
        <HomeVideoFeed
          data={oneVideo(playableLinked)}
          loadPage={async () => emptyPage}
          loadStudyAvailability={(songPostId) => availability(songPostId, identity())}
          mintPlaybackAccess={reviewPlaybackMint}
          posterPath={reviewPosterPath}
          resolveSongLink={reviewSongLinks}
          sourceIdentity={identity()}
        />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    await expect(canvas.queryByRole("link", { name: "Study" })).toBeNull();
    canvasElement.querySelector<HTMLButtonElement>("[data-story-sign-in]")!.click();
    await waitFor(() => expect(canvas.getByRole("link", { name: "Study" })).toBeInTheDocument());
  },
};
