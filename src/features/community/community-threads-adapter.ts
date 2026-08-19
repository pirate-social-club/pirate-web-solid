import type {
  GetPublicCommunityThreadsResponse,
  PirateApiClient,
} from "@pirate/api-client";

import { createPublicApiClient } from "../../api/client.ts";
import type { CommunityData, CommunityGate, CommunityPost, CommunityReferenceLink, CommunityRule } from "./page-shell/page-shell-model.ts";

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
  return {
    id: post.id,
    title,
    body,
    score: finiteNumber(item.upvote_count) - finiteNumber(item.downvote_count),
    publishedAt: publishedAt(post.created),
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
    name: "Harbor",
    handle: "c/harbor",
    description: "A community for harbor life, coastal ideas, and the people building around them.",
    members: 248,
    followers: 410,
    posts: [
      {
        id: "review-community-thread-1",
        title: "A sovereign town square",
        body: "The Harbor community is where neighbors share ideas, questions, and small moments worth bringing ashore.",
        score: 24,
        publishedAt: "2026-08-19T09:20:00.000Z",
      },
      {
        id: "review-community-thread-2",
        title: "What are you making this week?",
        body: "A place to share work in progress, ask for help, and find collaborators across the harbor.",
        score: 18,
        publishedAt: "2026-08-18T19:40:00.000Z",
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
