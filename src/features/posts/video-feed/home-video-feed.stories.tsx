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
import { createMemoryPendingEngagementStorage } from "../post-engagement/post-engagement-pending";

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
/** The signed-in viewer is a member of the post's community: Report is offered. */
const memberVideo: PublicFeedItem = { ...playableLinked, viewerMembershipStatus: "member" };
const nonMemberVideo: PublicFeedItem = { ...playableLinked, viewerMembershipStatus: "not_member" };
const reportPost = fn(async () => ({ report_id: "story-report", case_ref: "story-case", status: "open" as const }));
/** Signed-in review seams: an account id, a spy transport and in-memory records. */
const signedIn = () => ({
  principalId: "story-viewer",
  sourceIdentity: "user:story-viewer",
  reportTransport: { reportPost },
  pendingStorage: createMemoryPendingEngagementStorage(),
  generateIdempotencyKey: () => "story-report-key",
});
const phone = { viewport: { value: "mobile1", isRotated: false } };
const page = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);
const moreTrigger = (canvasElement: HTMLElement, layout: "desktop" | "phone") => waitFor(() => {
  const button = canvasElement.querySelector<HTMLButtonElement>(`[data-media-more="${layout}"] button`);
  if (!button) throw new Error(`${layout} More trigger not rendered`);
  return button;
});

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
    await expect(canvas.getAllByRole("button", { name: /Harbor lights/ }).length).toBeGreaterThan(0);
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

/**
 * Muted first, as browsers require for autoplay. Mute is not in the rail:
 * the More menu's Unmute row unmutes, and the row then reads Mute.
 */
export const MuteControlPolicy: Story = {
  name: "Mute control policy",
  args: { data: oneVideo(playableLinked) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await readyState(canvasElement);
    const player = await waitFor(() => { const video = canvasElement.querySelector("video"); expect(video).not.toBeNull(); return video!; });
    await waitFor(() => expect(player.muted).toBe(true));
    await expect(canvas.queryByRole("button", { name: /mute video/i })).toBeNull();
    await userEvent.click(await moreTrigger(canvasElement, "desktop"));
    await userEvent.click(await page(canvasElement).findByRole("menuitem", { name: "Unmute" }));
    await waitFor(() => expect(player.muted).toBe(false));
    await waitFor(() => expect(page(canvasElement).queryByRole("menu")).toBeNull());
    await userEvent.click(await moreTrigger(canvasElement, "desktop"));
    await expect(await page(canvasElement).findByRole("menuitem", { name: "Mute" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
  },
};

/** Signed in, desktop: the card with More (closed) and the rail beside it. */
export const SignedInDesktop: Story = {
  name: "Signed in desktop",
  args: { data: oneVideo(memberVideo), ...signedIn() },
  play: async ({ canvasElement }) => {
    await readyState(canvasElement);
    await expect(await moreTrigger(canvasElement, "desktop")).toBeVisible();
  },
};

/** Signed in, phone: full-bleed with More at the top right. */
export const SignedInMobile: Story = {
  name: "Signed in mobile",
  globals: phone,
  args: { data: oneVideo(memberVideo), ...signedIn() },
  play: async ({ canvasElement }) => {
    await readyState(canvasElement);
    await expect(await moreTrigger(canvasElement, "phone")).toBeVisible();
  },
};

/** Phone More sheet (Paper 171): Mute, then Report for a member. No Boost. */
export const MobileMoreSheet: Story = {
  name: "Mobile More sheet",
  globals: phone,
  args: { data: oneVideo(memberVideo), ...signedIn() },
  play: async ({ canvasElement }) => {
    await readyState(canvasElement);
    await userEvent.click(await moreTrigger(canvasElement, "phone"));
    const sheet = await page(canvasElement).findByRole("dialog", { name: "More options" });
    await expect(within(sheet).getAllByRole("button").map(row => row.textContent)).toEqual(["Unmute", "Report"]);
  },
};

/** Phone Report reasons (Paper 172): a sheet titled Report with seven reasons. */
export const MobileReportReasons: Story = {
  name: "Mobile report reasons",
  globals: phone,
  args: { data: oneVideo(memberVideo), ...signedIn() },
  play: async ({ canvasElement }) => {
    await readyState(canvasElement);
    await userEvent.click(await moreTrigger(canvasElement, "phone"));
    const sheet = await page(canvasElement).findByRole("dialog", { name: "More options" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Report" }));
    const reasons = await page(canvasElement).findByRole("dialog", { name: "Report" });
    await expect(within(reasons).getAllByRole("button").map(row => row.textContent)).toEqual([
      "Spam", "Harassment", "Hate", "Sexual content", "Graphic content", "Misleading", "Other",
    ]);
  },
};

/** Desktop More menu (Paper 173): under the three dots, Mute then Report. */
export const DesktopMoreMenu: Story = {
  name: "Desktop More menu",
  args: { data: oneVideo(memberVideo), ...signedIn() },
  play: async ({ canvasElement }) => {
    await readyState(canvasElement);
    await userEvent.click(await moreTrigger(canvasElement, "desktop"));
    const menu = await page(canvasElement).findByRole("menu");
    await expect(within(menu).getAllByRole("menuitem").map(item => item.textContent)).toEqual(["Unmute", "Report"]);
  },
};

/** Desktop Report dialog (Paper 174): 420px, title and close, seven reasons. */
export const DesktopReportDialog: Story = {
  name: "Desktop report dialog",
  args: { data: oneVideo(memberVideo), ...signedIn() },
  play: async ({ canvasElement }) => {
    await readyState(canvasElement);
    await userEvent.click(await moreTrigger(canvasElement, "desktop"));
    await userEvent.click(await page(canvasElement).findByRole("menuitem", { name: "Report" }));
    const dialog = await page(canvasElement).findByRole("dialog", { name: "Report" });
    await expect(within(dialog).getByRole("button", { name: "Close" })).toBeVisible();
    await expect(within(dialog).getAllByRole("button", { name: /^(Spam|Harassment|Hate|Sexual content|Graphic content|Misleading|Other)$/ })).toHaveLength(7);
  },
};

/** One tap on a reason sends the report once, then the dialog closes. */
export const ReportSendsOnce: Story = {
  name: "Report sends once",
  args: { data: oneVideo(memberVideo), ...signedIn() },
  play: async ({ canvasElement }) => {
    reportPost.mockClear();
    await readyState(canvasElement);
    await userEvent.click(await moreTrigger(canvasElement, "desktop"));
    await userEvent.click(await page(canvasElement).findByRole("menuitem", { name: "Report" }));
    const dialog = await page(canvasElement).findByRole("dialog", { name: "Report" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Misleading" }));
    await waitFor(() => expect(page(canvasElement).queryByRole("dialog", { name: "Report" })).toBeNull());
    await expect(reportPost).toHaveBeenCalledTimes(1);
  },
};

/** A signed-in viewer outside the post's community gets no Report. */
export const NonMemberNoReport: Story = {
  name: "Non-member has no Report",
  args: { data: oneVideo(nonMemberVideo), ...signedIn() },
  play: async ({ canvasElement }) => {
    await readyState(canvasElement);
    await userEvent.click(await moreTrigger(canvasElement, "desktop"));
    const menu = await page(canvasElement).findByRole("menu");
    await expect(within(menu).getAllByRole("menuitem").map(item => item.textContent)).toEqual(["Unmute"]);
    await expect(within(menu).queryByRole("menuitem", { name: "Report" })).toBeNull();
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

/** The initial load state before the first page resolves (Paper 175). */
export const Loading: Story = {
  globals: phone,
  args: { data: new Promise<FeedPage>(() => {}) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status", { name: "Loading videos" })).toBeInTheDocument();
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
  globals: phone,
  render: () => (
    <HomeVideoFeed
      data={Promise.reject(new Error("feed unavailable"))}
      loadPage={async () => { throw new Error("feed still unavailable"); }}
      navigate={() => undefined}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText("Couldn't load the feed.")).toBeInTheDocument());
    await expect(canvas.getByRole("button", { name: "Try again" })).toBeVisible();
  },
};

/** Try again re-runs the first-page load through the loader. */
export const RetryAfterFailure: Story = {
  name: "Retry after failure",
  render: () => (
    <HomeVideoFeed
      data={Promise.reject(new Error("feed unavailable"))}
      loadPage={async () => oneVideo(playableLinked)}
      attachPlayback={loadedAttach}
      mintPlaybackAccess={reviewPlaybackMint}
      posterPath={reviewPosterPath}
      resolveSongLink={reviewSongLinks}
      studyReady={async () => false}
      navigate={() => undefined}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Try again" }));
    await readyState(canvasElement);
    await waitFor(() => expect(canvasElement.querySelectorAll("[data-media-post]")).toHaveLength(1));
  },
};

/** A feed with no video items says so rather than rendering an empty player (Paper 176). */
export const NoVideos: Story = {
  globals: phone,
  args: { data: textOnlyPage },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText("Nothing here yet")).toBeInTheDocument());
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
    await waitFor(() => expect(canvasElement.querySelector(`[data-media-post="${playableLinked.id}"]`)).not.toBeNull());
    // The phone copy of the soundtrack line is the visible one at this width.
    const phoneSoundtrack = await waitFor(() => {
      const visible = canvas.getAllByRole("button", { name: /Harbor lights/ })
        .find(button => button.getBoundingClientRect().width > 0);
      if (!visible) throw new Error("no visible soundtrack control yet");
      return visible;
    });
    await expect(phoneSoundtrack).toBeVisible();
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
