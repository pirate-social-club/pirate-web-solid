import type {
  GetPublicCommunityThreadsResponse,
  PirateApiClient,
} from "@pirate/api-client";

import { createPublicApiClient } from "../../api/client.ts";
import type {
  CommunityData,
  CommunityGate,
  CommunityPost,
  CommunityReferenceLink,
  CommunityRoleHolder,
  CommunityRule,
} from "./page-shell/page-shell-model.ts";

export type CommunityThreadsClient = Pick<PirateApiClient, "get_publicCommunitiesCommunityRefFeed">;

export interface CommunityThreadsPage {
  readonly community: CommunityData;
  readonly joined: boolean;
  readonly following: boolean;
  readonly canJoin: boolean;
  readonly nextCursor: string | null;
}

function finiteNumber(value: number | string | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function publishedAt(value: number | string): string {
  const seconds = finiteNumber(value);
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function assetSrc(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("/") || trimmed.startsWith("data:") || trimmed.startsWith("https://")) return trimmed;
  return undefined;
}

function firstAssetSrc(value: ReadonlyArray<unknown> | null | undefined): string | undefined {
  const candidate = (value ?? []).find((item): item is string => typeof item === "string" && assetSrc(item) !== undefined);
  return candidate === undefined ? undefined : assetSrc(candidate);
}

function mapRoleHolder(holder: NonNullable<GetPublicCommunityThreadsResponse["community"]["owner"]>): CommunityRoleHolder {
  return {
    displayName: holder.display_name,
    handle: holder.handle,
    ...(assetSrc(holder.avatar_ref) ? { avatarSrc: assetSrc(holder.avatar_ref) } : {}),
    role: holder.role,
  };
}

function mapRules(response: GetPublicCommunityThreadsResponse): readonly CommunityRule[] {
  return response.community.rules
    .filter(rule => rule.status === "active")
    .map(rule => ({
      title: rule.title,
      body: rule.body,
      position: finiteNumber(rule.position),
    }));
}

function mapGates(response: GetPublicCommunityThreadsResponse): readonly CommunityGate[] {
  return response.community.membership_gate_summaries.map(gate => ({
    label: humanize(gate.gate_type),
    status: "unknown",
  }));
}

function mapReferenceLinks(response: GetPublicCommunityThreadsResponse): readonly CommunityReferenceLink[] {
  return (response.community.reference_links ?? []).flatMap((link, index) => {
    const label = typeof link.label === "string" ? link.label : undefined;
    const href = typeof link.href === "string" ? link.href : undefined;
    if (label === undefined || href === undefined) return [];
    return [{ label, href, position: index }];
  });
}

function mapPost(item: GetPublicCommunityThreadsResponse["items"][number]): CommunityPost {
  const post = item.post;
  const title = post.title ?? post.caption ?? humanize(post.post_type);
  const body = post.body ?? post.caption ?? post.anonymous_label ?? "";
  const authorHandle = post.author_public_handle ?? post.author_user ?? undefined;
  return {
    id: post.id,
    title,
    body,
    score: finiteNumber(item.upvote_count) - finiteNumber(item.downvote_count),
    publishedAt: publishedAt(post.created),
    authorName: authorHandle ?? post.anonymous_label ?? "Community member",
    ...(authorHandle ? { authorHandle } : {}),
    ...(firstAssetSrc(post.media_refs) ? { mediaSrc: firstAssetSrc(post.media_refs) } : {}),
    commentCount: finiteNumber(item.comment_count),
    postHref: `/p/${post.id}`,
  };
}

export function mapCommunityThreadsPage(response: GetPublicCommunityThreadsResponse): CommunityThreadsPage {
  const community = response.community;
  const routeSegment = community.route_slug ?? community.id;
  const membershipStatus = community.viewer_membership_status;
  const gates = mapGates(response);
  const data: CommunityData = {
    name: community.display_name,
    handle: `c/${routeSegment}`,
    description: community.description ?? `A community on Pirate.`,
    members: finiteNumber(community.member_count),
    followers: finiteNumber(community.follower_count),
    posts: response.items.map(mapPost),
    ...(assetSrc(community.avatar_ref) ? { avatarSrc: assetSrc(community.avatar_ref) } : {}),
    ...(assetSrc(community.banner_ref) ? { bannerSrc: assetSrc(community.banner_ref) } : {}),
    ...(community.default_surface ? { defaultSurface: community.default_surface } : {}),
    ...(community.video_feed_enabled !== null && community.video_feed_enabled !== undefined
      ? { videoFeedEnabled: community.video_feed_enabled }
      : {}),
    membershipMode: community.membership_mode,
    ...(community.owner ? { owner: mapRoleHolder(community.owner) } : {}),
    moderators: community.moderators.map(mapRoleHolder),
    ...(gates.length > 0 ? { gates } : {}),
    ...(community.gate_match_mode === "all" || community.gate_match_mode === "any"
      ? { gateMode: community.gate_match_mode }
      : {}),
    ...(community.rules.length > 0 ? { rules: mapRules(response) } : {}),
    ...(community.reference_links && community.reference_links.length > 0
      ? { referenceLinks: mapReferenceLinks(response) }
      : {}),
  };
  return {
    community: data,
    joined: membershipStatus === "member",
    following: community.viewer_following === true,
    canJoin: membershipStatus !== "banned",
    nextCursor: response.next_cursor,
  };
}

export async function fetchCommunityThreadsPage(options: {
  readonly communityRef: string;
  readonly client?: CommunityThreadsClient;
  readonly cursor?: string | null;
  readonly locale?: string;
}): Promise<CommunityThreadsPage> {
  const client = options.client ?? createPublicApiClient();
  const response = await client.get_publicCommunitiesCommunityRefFeed({
    path: { communityRef: options.communityRef },
    query: {
      locale: options.locale ?? "en",
      sort: "new",
      surface: "threads",
      ...(options.cursor ? { cursor: options.cursor } : {}),
    },
  });
  return mapCommunityThreadsPage(response);
}

export const communityReviewPage: CommunityThreadsPage = {
  community: {
    name: "Tame Impala",
    handle: "c/tameimpala",
    description: "Albums, deep cuts, live sessions, and production talk.",
    members: 248,
    followers: 410,
    bannerSrc: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 420'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%231d6a51'/%3E%3Cstop offset='.58' stop-color='%230d4d5c'/%3E%3Cstop offset='1' stop-color='%231e2348'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1600' height='420' fill='url(%23g)'/%3E%3Cpath d='M0 285C260 210 470 220 720 280s520 75 880-55v195H0z' fill='rgba(255,255,255,.1)'/%3E%3C/svg%3E",
    videoFeedEnabled: true,
    owner: { displayName: "Deckhand", handle: "deckhand", role: "owner" },
    posts: [
      {
        authorName: "Tame Impala voice",
        authorHandle: "tameimpala.voice",
        id: "review-community-thread-1",
        title: "A sovereign town square",
        body: "The Tame Impala community is where fans share ideas, questions, and live-session notes.",
        commentCount: 7,
        mediaSrc: "/poster-1.jpg",
        score: 24,
        publishedAt: "2026-08-19T09:20:00.000Z",
      },
      {
        authorName: "Builder",
        authorHandle: "builder",
        id: "review-community-thread-2",
        title: "What are you making this week?",
        body: "A place to share work in progress, ask for help, and find collaborators across the community.",
        commentCount: 4,
        score: 18,
        publishedAt: "2026-08-18T19:40:00.000Z",
        mediaSrc: "/poster-2.jpg",
      },
    ],
    rules: [
      { title: "Keep it constructive", body: "Make room for useful conversation and good-faith disagreement.", position: 1 },
      { title: "Share the water", body: "Post things that help the community learn, make, or connect.", position: 2 },
    ],
  },
  joined: false,
  following: false,
  canJoin: true,
  nextCursor: null,
};
