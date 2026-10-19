/** @jsxImportSource @solidjs/web */
import { EngagementControls } from "../../posts/shared-engagement/engagement-controls.tsx";
import { createSignal } from "solid-js";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { reviewCanplayAttach, reviewPlaybackMint, reviewPosterPath } from "../../posts/feed/public-feed-fixtures";
import { VideoPlaybackSeamsContext } from "../../posts/video-submission/video-playback-seams";
import { type CommunityData, type CommunityPost } from "./page-shell-model";
import { CommunityPageShell, type CommunityPageShellProps } from "./page-shell";
import { RewardServiceAvailabilityContext } from "../../rewards/reward-service-availability.tsx";

const infinity: CommunityData = {
  name: "Infinity", handle: "c/infinity", description: "To infinity and beyond", members: 1_270, followers: 18_400, posts: [],
};

const tameImpala: CommunityData = {
  name: "Tame Impala", handle: "c/tameimpala", description: "Albums, deep cuts, live sessions, and production talk.", members: 48_231, followers: 92_100,
  membershipMode: "gated",
  posts: [
    { authorHandle: "midnightwaves.pirate", body: "The build on this one still surprises me.", commentCount: 23, id: "apocalypse-dreams", kind: "song", mediaArtist: "Tame Impala", mediaTitle: "Apocalypse Dreams", publishedAt: "2026-08-16", score: 128, title: "Apocalypse Dreams" },
    { authorHandle: "harbour.pirate", body: "The live arrangement left more room for the final chorus.", id: "live-arrangement", publishedAt: "2026-08-15", score: 18, title: "What is the best Tame Impala live arrangement?" },
    { authorHandle: "sunset.pirate", body: "A synth patch from the latest tour, with the filter settings included.", id: "synth-patch", publishedAt: "2026-08-15", score: 42, title: "Share a synth patch from the latest tour." },
    { authorHandle: "harbour.pirate", body: "Weekly listening thread: Currents side B.", id: "listening-thread", publishedAt: "2026-08-14", score: 9, title: "Weekly listening thread" },
  ],
  referenceLinks: [{ href: "https://open.spotify.com/artist/example", label: "Spotify", position: 1 }, { href: "https://tameimpala.com", label: "Official site", position: 2 }],
  rules: [{ body: "Memes belong in the weekly discussion thread.", position: 1, title: "Keep posts on topic" }, { body: "Use the appropriate flair when posting.", position: 2, title: "Flair your posts" }],
};

type StoryCommunityPageShellProps = Omit<CommunityPageShellProps, "following" | "joined" | "onFollowToggle" | "onJoin"> & { initialFollowing?: boolean; initialJoined?: boolean };

function StoryCommunityPageShell(props: StoryCommunityPageShellProps) {
  const [following, setFollowing] = createSignal(props.initialFollowing ?? props.initialJoined ?? false);
  const [joined, setJoined] = createSignal(props.initialJoined ?? false);
  return <CommunityPageShell {...props} following={following()} joined={joined()} onFollowToggle={() => setFollowing((value) => !value)} onJoin={() => { setJoined(true); setFollowing(true); }} onCreatePost={() => undefined} />;
}

const meta = {
  title: "Screens/Community/PageShell",
  component: CommunityPageShell,
  args: { community: tameImpala, following: false, joined: false },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CommunityPageShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = { render: () => <StoryCommunityPageShell community={tameImpala} /> };
export const EmptyCommunity: Story = { render: () => <StoryCommunityPageShell community={infinity} /> };
export const CommunityWithPosts: Story = { render: () => <StoryCommunityPageShell community={tameImpala} initialJoined /> };
export const FollowingNotMember: Story = { render: () => <StoryCommunityPageShell community={tameImpala} initialFollowing /> };

// Geometry states. The page must not move as the viewer's authority settles,
// so these four are measured against one another at mobile and desktop widths
// by scripts/community-geometry-check.mjs.
const geometryCommunity: CommunityData = { ...tameImpala, name: "Geometry" };

export const AuthorityPending: Story = {
  name: "Geometry / Authority pending",
  render: () => (
    <CommunityPageShell
      authorityPending
      community={geometryCommunity}
      following={false}
      joined={false}
      managePending
    />
  ),
};

/** The first paint without a session cookie: nothing is reserved. */
export const AuthorityPendingAnonymous: Story = {
  name: "Geometry / Authority pending anonymous",
  render: () => (
    <CommunityPageShell
      authorityPending
      community={geometryCommunity}
      following={false}
      joined={false}
      managePending
    />
  ),
};

export const SettledAnonymous: Story = {
  name: "Geometry / Settled anonymous",
  render: () => (
    <CommunityPageShell community={geometryCommunity} following={false} joined={false} />
  ),
};

export const SettledMember: Story = {
  name: "Geometry / Settled member",
  render: () => (
    <CommunityPageShell
      community={geometryCommunity}
      following
      joined
      onCreatePost={() => undefined}
    />
  ),
};

export const SettledModerator: Story = {
  name: "Geometry / Settled moderator",
  render: () => (
    <CommunityPageShell
      community={geometryCommunity}
      following
      joined
      onCreatePost={() => undefined}
      onManage={() => undefined}
    />
  ),
};

export const ViewerUnknown: Story = {
  name: "Geometry / Membership read failed",
  render: () => (
    <CommunityPageShell community={geometryCommunity} following={false} joined={false} viewerUnknown />
  ),
};

export const RequestPending: Story = {
  render: () => <CommunityPageShell community={geometryCommunity} following joined={false} joinDisabled joinLabel="Request pending" />,
};
export const MembershipUnavailable: Story = {
  render: () => <CommunityPageShell community={geometryCommunity} following={false} joined={false} joinDisabled joinLabel="Unavailable" />,
};
export const PostingProfilesUnavailable: Story = {
  render: () => <CommunityPageShell community={geometryCommunity} following joined createPostLabel="Retry and open Post" onCreatePost={() => undefined} />,
};
export const SortAndManagement: Story = {
  render: () => <CommunityPageShell community={geometryCommunity} following joined onCreatePost={() => undefined} onManage={() => undefined} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getAllByRole("button", { name: "Sort community feed" }).find(button => button.getBoundingClientRect().width > 0)!;
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole("menuitemradio", { name: "New" }));
    await expect(body.queryByRole("menu")).not.toBeInTheDocument();
    // Focus returns to the trigger a couple of frames after the menu closes.
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    const current = await body.findByRole("menuitemradio", { name: "New" });
    await expect(current).toHaveAttribute("aria-checked", "true");
    await userEvent.click(current);
    await expect(body.queryByRole("menu")).not.toBeInTheDocument();
    // Focus returns to the trigger a couple of frames after the menu closes.
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(canvas.getByRole("button", { name: "More community options" }));
    await expect(await body.findByRole("menuitem", { name: "Manage" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  },
};
export const MobileSort: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <CommunityPageShell community={geometryCommunity} following joined onCreatePost={() => undefined} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    // The manager applies the phone viewport after the initial iframe render.
    await waitFor(() => expect(canvasElement.ownerDocument.defaultView?.matchMedia("(max-width: 767px)").matches).toBe(true));
    const trigger = canvas.getAllByRole("button", { name: "Sort community feed" }).find(button => button.getBoundingClientRect().width > 0)!;
    await userEvent.click(trigger);
    await userEvent.click(await body.findByRole("button", { name: "New" }));
    await expect(body.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await expect(await body.findByRole("button", { name: "New" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.keyboard("{Escape}");
  },
};

function ThreadLinksFixture() {
  const [actions, setActions] = createSignal(0);
  const called = () => { setActions(value => value + 1); };
  return <>
    <CommunityPageShell following joined={false} community={{
      ...infinity, name: "Night Shift", posts: [
        { id: "thread-link-text", title: "A full discussion", body: "Tap this post to read the full thread.", score: 0, commentCount: 2, publishedAt: "2026-10-08" },
        { id: "thread-link-song", kind: "song", title: "An original song", body: "Recording notes from the session.", score: 0, commentCount: 1, publishedAt: "2026-10-08" },
        { id: "thread-link-untitled", title: "", body: "An untitled discussion still opens its full thread.", score: 0, commentCount: 0, publishedAt: "2026-10-09" },
      ],
    }} renderPost={(post, render) => render(
      <EngagementControls score={post.score} commentCount={post.commentCount ?? 0} onVote={called} onComment={called} />,
      [{ label: "Report", run: called }],
    )} />
    <output aria-label="Action calls">{actions()}</output>
  </>;
}

export const FeedPostThreadLinks: Story = {
  render: ThreadLinksFixture,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "A full discussion" })).toHaveAttribute("href", "/post/thread-link-text");
    await expect(canvas.getByRole("link", { name: "An original song" })).toHaveAttribute("href", "/post/thread-link-song");
    await expect(canvas.getByRole("link", { name: "An untitled discussion still opens its full thread." })).toHaveAttribute("href", "/post/thread-link-untitled");
    await expect(canvas.getByRole("link", { name: "A full discussion" })).toHaveAttribute("rel", "external");
    await userEvent.click(canvas.getAllByRole("button", { name: "Upvote" })[0]!);
    await userEvent.click(canvas.getByRole("button", { name: "Comments (2)" }));
    await userEvent.click(canvas.getAllByRole("button", { name: "Post options" })[0]!);
    await userEvent.click(within(canvasElement.ownerDocument.body).getByRole("menuitem", { name: "Report" }));
    await expect(canvas.getByLabelText("Action calls")).toHaveTextContent("3");
    const untitled = canvas.getByRole("link", { name: "An untitled discussion still opens its full thread." });
    untitled.closest("article")?.scrollIntoView({ block: "center" });
    untitled.focus();
    await userEvent.tab({ shift: true });
    await userEvent.tab();
    await expect(untitled).toHaveFocus();
    await expect(untitled.matches(":focus-visible")).toBe(true);
    await expect(getComputedStyle(untitled, "::after").boxShadow).not.toBe("none");
  },
};

export const FeedPostThreadLinksOnMobile: Story = {
  ...FeedPostThreadLinks,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

const twoHoursAgo = () => new Date(Date.now() - 2 * 3_600_000).toISOString();

/** The three kinds of the Paper PostCard sheet, in one feed, with live-route pills. */
const mixedKindPosts = (): CommunityPost[] => [
  { id: "kind-text", authorHandle: "wavemaker", title: "Weekly listening thread", body: "What have you had on repeat this week?", score: 18, commentCount: 24, publishedAt: twoHoursAgo() },
  { id: "kind-song", authorHandle: "wavemaker", kind: "song", title: "Harbor Lights", mediaTitle: "Harbor Lights", mediaArtist: "The Tidewater", body: "Late-night loop, take two.", score: 18, commentCount: 24, publishedAt: twoHoursAgo() },
  { id: "kind-video", authorHandle: "wavemaker", kind: "video", title: "video", mediaTitle: "Harbor Lights", body: "", score: 18, commentCount: 24, publishedAt: twoHoursAgo(), video: { playback: "ready", thumbnail: "ready" } },
];

function MixedKindsFixture(props: { posts?: CommunityPost[] }) {
  return <VideoPlaybackSeamsContext value={{ mint: reviewPlaybackMint, attach: reviewCanplayAttach, posterPath: reviewPosterPath }}>
    <CommunityPageShell following joined community={{ ...infinity, name: "Harbor Collective", posts: props.posts ?? mixedKindPosts() }}
      renderPost={(post, render) => render(
        <EngagementControls score={post.score} commentCount={post.commentCount ?? 0} onVote={() => undefined} onComment={() => undefined} />,
        [{ label: "Report", run: () => undefined }],
      )} />
  </VideoPlaybackSeamsContext>;
}

/**
 * Parts/Posts/PostCard: text, song and video in the shared card. The reward
 * pill is absent on purpose: there is no live activity count and Rewards are
 * disabled, so it lives only in Patterns/Engagement/RewardPill. Boost also
 * stays hidden unless the authenticated reward policy service is available.
 */
export const MixedKinds: Story = {
  render: () => <MixedKindsFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "Weekly listening thread" })).toHaveAttribute("href", "/post/kind-text");
    await expect(canvas.getByRole("button", { name: "Play Harbor Lights" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Open video post" })).toHaveAttribute("href", "/post/kind-video");
    const frame = canvasElement.querySelector<HTMLElement>('[data-community-video="kind-video"]');
    if (frame === null) throw new Error("Expected the video frame");
    // The player mints only while its frame is on screen.
    frame.scrollIntoView({ block: "center" });
    await waitFor(() => expect(frame.querySelector("video")?.getAttribute("poster")).toContain("poster"));
    await waitFor(() => expect(within(frame).getByRole("button", { name: "Play video" })).toBeVisible());
    await expect(canvas.queryByRole("button", { name: /^Rewards/ })).toBeNull();
    for (const time of canvasElement.querySelectorAll("[data-community-post] time")) await expect(time).toHaveTextContent("2h");
  },
};

export const MixedKindsOnMobile: Story = {
  ...MixedKinds,
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

/** A video that cannot play yet stays one quiet line over its frame. */
export const VideoDeliveryStates: Story = {
  render: () => <MixedKindsFixture posts={[
    { id: "video-pending", authorHandle: "wavemaker", kind: "video", title: "video", body: "Still processing.", score: 0, commentCount: 0, publishedAt: twoHoursAgo(), video: { playback: "pending", thumbnail: "pending" } },
    { id: "video-unavailable", authorHandle: "wavemaker", kind: "video", title: "video", body: "Delivery failed.", score: 0, commentCount: 0, publishedAt: twoHoursAgo(), video: { playback: "unavailable", thumbnail: "unavailable" } },
    { id: "video-no-poster", authorHandle: "wavemaker", kind: "video", title: "video", mediaTitle: "Harbor Lights", body: "Ready before its thumbnail.", score: 0, commentCount: 0, publishedAt: twoHoursAgo(), video: { playback: "ready", thumbnail: "pending" } },
  ]} />,
  play: async ({ canvasElement }) => {
    const frame = (id: string) => {
      const element = canvasElement.querySelector<HTMLElement>(`[data-community-video="${id}"]`);
      if (element === null) throw new Error(`Expected the ${id} frame`);
      return within(element);
    };
    await expect(frame("video-pending").getByText("Playback is being prepared.")).toBeVisible();
    await expect(frame("video-unavailable").getByText("Playback is unavailable.")).toBeVisible();
    canvasElement.querySelector('[data-community-video="video-no-poster"]')?.scrollIntoView({ block: "center" });
    await waitFor(() => expect(frame("video-no-poster").getByRole("button", { name: "Play video" })).toBeVisible());
    await expect(canvasElement.querySelector('[data-community-video="video-no-poster"] video[poster]')).toBeNull();
  },
};

/**
 * Boost is the live sponsor entry point, reached from the song card's
 * overflow menu: choose it, the sponsor dialog opens over the feed, and
 * dismissing it returns focus to the menu that opened it.
 */
export const SongBoostFromMenu: Story = {
  // This fixture explicitly models an available service, not financial admission.
  render: () => <RewardServiceAvailabilityContext value={() => true}><CommunityPageShell following joined community={{ ...infinity, id: "community-boost", name: "Harbor Collective", posts: [
    { id: "boost-song", authorHandle: "wavemaker", kind: "song", title: "Harbor Lights", mediaTitle: "Harbor Lights", body: "Late-night loop, take two.", score: 18, commentCount: 24, publishedAt: twoHoursAgo() },
    { id: "boost-text", authorHandle: "wavemaker", title: "Weekly listening thread", body: "What have you had on repeat this week?", score: 18, commentCount: 24, publishedAt: twoHoursAgo() },
  ] }} /></RewardServiceAvailabilityContext>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const song = canvasElement.querySelector<HTMLElement>('[data-community-post="boost-song"]');
    const text = canvasElement.querySelector<HTMLElement>('[data-community-post="boost-text"]');
    if (song === null || text === null) throw new Error("Expected both cards");
    // A text post offers no Boost and, with no other actions, no menu.
    await expect(within(text).queryByRole("button", { name: "Post options" })).not.toBeInTheDocument();
    const trigger = within(song).getByRole("button", { name: "Post options" });
    await userEvent.click(trigger);
    await userEvent.click(await page.findByRole("menuitem", { name: "Boost" }));
    const dialog = await page.findByRole("dialog");
    await expect(dialog).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(canvas.getByRole("button", { name: "Play Harbor Lights" })).toBeVisible();
  },
};

/**
 * An 18+ video in the card. Playback is refused until the viewer proves
 * their age; the card then offers the age check in its own frame and never
 * starts playback by itself.
 */
export const AdultVideoAccess: Story = {
  render: () => <VideoPlaybackSeamsContext value={{ mint: async () => { throw new Error("Age verification required"); }, attach: reviewCanplayAttach, posterPath: reviewPosterPath }}>
    <CommunityPageShell following joined community={{ ...infinity, name: "Harbor Collective", posts: [
      { id: "adult-video", authorHandle: "wavemaker", kind: "video", title: "video", mediaTitle: "Harbor Lights", body: "After hours.", score: 0, commentCount: 0, publishedAt: twoHoursAgo(), video: { playback: "ready", thumbnail: "ready" }, requiresAgeVerification: true },
    ] }} />
  </VideoPlaybackSeamsContext>,
  play: async ({ canvasElement }) => {
    const frame = canvasElement.querySelector<HTMLElement>('[data-community-video="adult-video"]');
    if (frame === null) throw new Error("Expected the video frame");
    frame.scrollIntoView({ block: "center" });
    await waitFor(() => expect(within(frame).getByText(/Playback is unavailable/u)).toBeVisible());
    await expect(within(frame).getByRole("button", { name: /verify/iu })).toBeVisible();
    await expect(within(frame).queryByRole("button", { name: "Play video" })).not.toBeInTheDocument();
    await expect(frame.querySelector("video")?.getAttribute("src") ?? null).toBeNull();
  },
};

/** The phone More sheet keeps a visible close above its rows (ruling 2026-10-16). */
export const MobileMoreSheet: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <CommunityPageShell community={geometryCommunity} following joined={false} onFollowToggle={() => undefined} onManage={() => undefined} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(canvasElement.ownerDocument.defaultView?.matchMedia("(max-width: 767px)").matches).toBe(true));
    const trigger = canvasElement.querySelector<HTMLElement>("[data-community-more='sheet']")!;
    await userEvent.click(trigger);
    const sheet = await body.findByRole("dialog", { name: "More community options" });
    const rows = [...sheet.querySelectorAll<HTMLButtonElement>("[data-community-more-action]")];
    await expect(rows.map(row => row.textContent)).toEqual(["Share", "Unfollow", "Manage"]);
    const close = within(sheet).getByRole("button", { name: "Close" });
    await expect(close).toBeVisible();
    await expect(close.getBoundingClientRect().bottom).toBeLessThanOrEqual(rows[0]!.getBoundingClientRect().top);
    await userEvent.click(close);
    await waitFor(() => expect(sheet).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
