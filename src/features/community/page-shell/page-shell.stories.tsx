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
  name: "Infinity", handle: "c/infinity", description: "To infinity and beyond", members: 1_270, followers: 18_400, posts: [], videoFeedEnabled: false,
};

const tameImpala: CommunityData = {
  name: "Tame Impala", handle: "c/tameimpala", description: "Albums, deep cuts, live sessions, and production talk.", members: 48_231, followers: 92_100,
  bannerSrc: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 420'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%231b6b52'/%3E%3Cstop offset='.55' stop-color='%230d4855'/%3E%3Cstop offset='1' stop-color='%231d2147'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1600' height='420' fill='url(%23g)'/%3E%3Cellipse cx='1160' cy='20' rx='420' ry='180' fill='rgba(255,255,255,.1)'/%3E%3Cpath d='M0 290C250 220 470 220 720 280s510 80 880-50v190H0z' fill='rgba(255,255,255,.1)'/%3E%3C/svg%3E",
  videoFeedEnabled: true,
  owner: { displayName: "Kevin Parker", handle: "kevinparker", role: "owner" },
  posts: [
    { authorHandle: "tameimpala.pirate", authorName: "Tame Impala", body: "The live arrangement left more room for the final chorus.", commentCount: 21, id: "live-arrangement", publishedAt: "2026-08-16", publishedLabel: "2w", score: 18, title: "What is the best Tame Impala live arrangement?", mediaSrc: "/poster-1.jpg" },
    { authorHandle: "synthhead", authorName: "Synthhead", body: "A synth patch from the latest tour, with the filter settings included.", commentCount: 8, id: "synth-patch", publishedAt: "2026-08-15", publishedLabel: "2w", score: 42, title: "Share a synth patch from the latest tour." },
    { authorHandle: "currentsclub", authorName: "Currents Club", body: "Weekly listening thread: Currents side B.", commentCount: 14, id: "listening-thread", publishedAt: "2026-08-14", publishedLabel: "3w", score: 9, title: "Weekly listening thread" },
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
  title: "Compositions/Community/PageShell",
  component: CommunityPageShell,
  args: { community: tameImpala, following: false, joined: false },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CommunityPageShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = { render: () => <StoryCommunityPageShell community={tameImpala} {...overviewStoryState} /> };
export const EmptyCommunity: Story = { render: () => <StoryCommunityPageShell community={infinity} empty /> };
export const CommunityWithPosts: Story = { render: () => <StoryCommunityPageShell community={tameImpala} {...communityWithPostsStoryState} /> };
export const PassportScoreGated: Story = { name: "States / Passport Score Gated", render: () => <StoryCommunityPageShell community={{ ...tameImpala, name: "Passport Score", description: "A community gated by Human Passport wallet reputation.", gates: [{ label: "Passport score 20+", status: "unmet" }], gateMode: "all" }} canJoin /> };
export const GatesAndMode: Story = { name: "States / AND gates", render: () => <StoryCommunityPageShell community={gateCommunity("AND Gates", "all")} canJoin /> };
export const GatesOrMode: Story = { name: "States / OR gates", render: () => <StoryCommunityPageShell community={gateCommunity("OR Gates", "any")} canJoin /> };
export const CommunityViewportPreset: Story = { name: "Mobile / Feed header actions", parameters: { viewport: { defaultViewport: "mobile1" } }, render: () => <StoryCommunityPageShell community={tameImpala} mobile initialFollowing initialJoined /> };
export const FollowingNotCitizen: Story = { render: () => <StoryCommunityPageShell community={tameImpala} initialFollowing /> };
export const CanFollowCannotJoin: Story = { render: () => <StoryCommunityPageShell community={infinity} canJoin={false} /> };
