/** @jsxImportSource @solidjs/web */
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";

import {
  communityWithPostsStoryState,
  overviewStoryState,
  type CommunityData,
} from "./page-shell-model";
import { CommunityPageShell, type CommunityPageShellProps } from "./page-shell";

const infinity: CommunityData = {
  name: "Infinity", handle: "c/infinity", description: "To infinity and beyond", members: 1_270, followers: 18_400, posts: [],
};

const tameImpala: CommunityData = {
  name: "Tame Impala", handle: "c/tameimpala", description: "Albums, deep cuts, live sessions, and production talk.", members: 48_231, followers: 92_100,
  posts: [
    { authorHandle: "midnightwaves.pirate", body: "Apocalypse Dreams", commentCount: 23, id: "apocalypse-dreams", kind: "song", learnAvailable: true, karaokeAvailable: true, mediaArtist: "Tame Impala", mediaDuration: "5:56", mediaProgress: 62, mediaTitle: "Apocalypse Dreams", publishedAt: "2026-08-16", rewardLabels: ["Learn due"], score: 128, title: "Apocalypse Dreams" },
    { body: "The live arrangement left more room for the final chorus.", id: "live-arrangement", publishedAt: "2026-08-15", score: 18, title: "What is the best Tame Impala live arrangement?" },
    { body: "A synth patch from the latest tour, with the filter settings included.", id: "synth-patch", publishedAt: "2026-08-15", score: 42, title: "Share a synth patch from the latest tour." },
    { body: "Weekly listening thread: Currents side B.", id: "listening-thread", publishedAt: "2026-08-14", score: 9, title: "Weekly listening thread" },
  ],
  referenceLinks: [{ href: "https://open.spotify.com/artist/example", label: "Spotify", position: 1 }, { href: "https://tameimpala.com", label: "Official site", position: 2 }],
  rules: [{ body: "Memes belong in the weekly discussion thread.", position: 1, title: "Keep posts on topic" }, { body: "Use the appropriate flair when posting.", position: 2, title: "Flair your posts" }],
};

function gateCommunity(name: string, mode: "all" | "any"): CommunityData {
  return { ...tameImpala, name, handle: `c/${name.toLowerCase().replaceAll(" ", "-")}`, description: mode === "all" ? "Requires both a high Passport score and a palm scan." : "Join with either a high Passport score or a palm scan.", gates: [{ label: "Passport score 8+", status: "unmet" }, { label: "Palm scan", status: "unknown" }], gateMode: mode };
}

type StoryCommunityPageShellProps = Omit<CommunityPageShellProps, "following" | "joined" | "onFollowToggle" | "onJoin"> & { initialFollowing?: boolean; initialJoined?: boolean };

function StoryCommunityPageShell(props: StoryCommunityPageShellProps) {
  const [following, setFollowing] = createSignal(props.initialFollowing ?? false);
  const [joined, setJoined] = createSignal(props.initialJoined ?? false);
  return <CommunityPageShell {...props} following={following()} joined={joined()} onFollowToggle={() => setFollowing((value) => !value)} onJoin={() => { setJoined(true); setFollowing(true); }} />;
}

const meta = {
  title: "Screens/Community/PageShell",
  component: CommunityPageShell,
  args: { community: tameImpala, following: false, joined: false },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CommunityPageShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = { render: () => <StoryCommunityPageShell community={tameImpala} {...overviewStoryState} /> };
export const EmptyCommunity: Story = { render: () => <StoryCommunityPageShell community={infinity} empty /> };
export const CommunityWithPosts: Story = { render: () => <StoryCommunityPageShell community={tameImpala} viewerSignedIn {...communityWithPostsStoryState} /> };
export const PassportScoreGated: Story = { name: "States / Passport Score Gated", render: () => <StoryCommunityPageShell community={{ ...tameImpala, name: "Passport Score", description: "A community gated by Human Passport wallet reputation.", gates: [{ label: "Passport score 20+", status: "unmet" }], gateMode: "all" }} canJoin /> };
export const GatesAndMode: Story = { name: "States / AND gates", render: () => <StoryCommunityPageShell community={gateCommunity("AND Gates", "all")} canJoin /> };
export const GatesOrMode: Story = { name: "States / OR gates", render: () => <StoryCommunityPageShell community={gateCommunity("OR Gates", "any")} canJoin /> };
export const CommunityViewportPreset: Story = { name: "Mobile / Feed header actions", globals: { viewport: { value: "mobile1", isRotated: false } }, render: () => <StoryCommunityPageShell community={tameImpala} mobile initialFollowing initialJoined viewerSignedIn /> };
export const FollowingNotCitizen: Story = { render: () => <StoryCommunityPageShell community={tameImpala} initialFollowing viewerSignedIn /> };
export const CanFollowCannotJoin: Story = { render: () => <StoryCommunityPageShell community={infinity} canJoin={false} /> };

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
      viewerSignedIn
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
      personaControl={<span data-operation-persona>Commenting as harbour</span>}
      viewerSignedIn
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
      personaControl={<span data-operation-persona>Commenting as harbour</span>}
      viewerSignedIn
    />
  ),
};

export const ViewerUnknown: Story = {
  name: "Geometry / Membership read failed",
  render: () => (
    <CommunityPageShell community={geometryCommunity} following={false} joined={false} viewerUnknown viewerSignedIn />
  ),
};
