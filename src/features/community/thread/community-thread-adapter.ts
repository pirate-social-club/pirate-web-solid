import type { GetPostResponse, PirateApiClient } from "@pirate/api-client";

import { createPublicApiClient } from "../../../api/client.ts";
import type { CommunityPost } from "../page-shell/page-shell-model.ts";
import type { CommunityThread } from "./community-thread-model.ts";

export type CommunityThreadClient = Pick<PirateApiClient, "get_postsPostId">;

function finiteNumber(value: number | string | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function publishedAt(value: number | string): string {
  const seconds = finiteNumber(value);
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function assetSrc(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.startsWith("/") || trimmed.startsWith("data:") || trimmed.startsWith("https://") ? trimmed : undefined;
}

function mapPost(response: GetPostResponse): CommunityPost {
  const post = response.post;
  const authorHandle = post.author_public_handle ?? post.author_user ?? undefined;
  const title = post.title ?? post.caption ?? post.label ?? "Untitled post";
  const body = post.body ?? post.caption ?? post.anonymous_label ?? "";
  const mediaSrc = (post.media_refs ?? []).map(assetSrc).find((value): value is string => value !== undefined);
  return {
    id: post.id,
    title,
    body,
    score: finiteNumber(response.upvote_count) - finiteNumber(response.downvote_count),
    publishedAt: publishedAt(post.created),
    authorName: authorHandle ?? post.anonymous_label ?? "Community member",
    ...(authorHandle ? { authorHandle } : {}),
    ...(mediaSrc ? { mediaSrc } : {}),
    commentCount: finiteNumber(response.comment_count),
    viewerVote: response.viewer_vote === 1 ? "up" : response.viewer_vote === -1 ? "down" : null,
    postHref: `/p/${post.id}`,
  };
}

export function mapCommunityThread(response: GetPostResponse): CommunityThread {
  const community = response.community;
  const route = community?.route_slug ?? community?.id;
  const commentCount = finiteNumber(response.comment_count);
  return {
    post: mapPost(response),
    ...(community?.display_name ? { communityName: community.display_name } : {}),
    ...(route ? { communityHref: `/c/${route}/threads` } : {}),
    comments: [],
    commentsStatus: response.post.comments_locked === true
      ? "locked"
      : commentCount > 0 ? "unavailable" : "ready",
  };
}

export async function fetchCommunityThread(options: {
  readonly postId: string;
  readonly client?: CommunityThreadClient;
  readonly locale?: string;
}): Promise<CommunityThread> {
  const client = options.client ?? createPublicApiClient();
  const response = await client.get_postsPostId({
    path: { postId: options.postId },
    query: { locale: options.locale ?? "en" },
  });
  return mapCommunityThread(response);
}
