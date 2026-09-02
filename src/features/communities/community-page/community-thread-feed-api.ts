import {
  createPirateApiClient,
  type GetPublicCommunitiesCommunityRefFeedResponse,
  type PirateApiClient,
} from "@pirate/api-client";

import {
  createGeneratedApiClient,
  type ApiClientFactoryOptions,
} from "../../../api/client.ts";
import type { CommunityPost } from "../../community/page-shell/page-shell-model.ts";

export type CommunityThreadFeedClient = Pick<PirateApiClient, "get_publicCommunitiesCommunityRefFeed">;

export interface CommunityThreadPage {
  readonly posts: readonly CommunityPost[];
  readonly nextCursor: string | null;
}

export function createCommunityThreadFeedClient(
  options: ApiClientFactoryOptions = {},
): CommunityThreadFeedClient {
  return createGeneratedApiClient(createPirateApiClient, options, { credentials: "omit" });
}

function finiteCount(value: number | string | null | undefined): number {
  const numeric = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof numeric === "number" && Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

type ThreadItem = GetPublicCommunitiesCommunityRefFeedResponse["items"][number];

function threadPost(item: ThreadItem): CommunityPost | null {
  if ("kind" in item) return null;
  const post = item.post;
  if (post.status !== "published") return null;
  const created = typeof post.created === "number" ? new Date(post.created * 1_000) : null;
  if (created === null || Number.isNaN(created.getTime())) return null;
  const persona = post.author_persona;
  const authorHandle = post.identity_mode === "anonymous"
    ? post.anonymous_label ?? "Anonymous"
    : persona?.primary_public_handle ?? post.author_public_handle ?? persona?.display_name ?? "Public creator";
  const title = post.title ?? post.caption ?? (post.post_type === "song" ? post.song_title : null) ?? post.post_type;
  const body = post.body ?? post.caption ?? "";
  return {
    id: post.id,
    title,
    body,
    score: finiteCount(item.upvote_count) - finiteCount(item.downvote_count),
    publishedAt: created.toISOString(),
    authorHandle,
    authorAvatarSrc: persona?.avatar_ref ?? null,
    kind: post.post_type === "song" ? "song" : "text",
    ...(post.post_type === "song" && post.song_title ? { mediaTitle: post.song_title } : {}),
    commentCount: finiteCount(item.comment_count),
    learnAvailable: post.post_type === "song",
    karaokeAvailable: post.post_type === "song",
  };
}

export function normalizeCommunityThreadPage(
  response: GetPublicCommunitiesCommunityRefFeedResponse,
): CommunityThreadPage {
  return {
    posts: response.items.flatMap(item => {
      const projected = threadPost(item);
      return projected ? [projected] : [];
    }),
    nextCursor: response.next_cursor,
  };
}

export interface LoadCommunityThreadPageOptions {
  readonly client?: CommunityThreadFeedClient;
  readonly communityRef: string;
  readonly cursor?: string | null;
  readonly locale?: string;
}

export async function loadCommunityThreadPage(
  options: LoadCommunityThreadPageOptions,
): Promise<CommunityThreadPage> {
  const client = options.client ?? createCommunityThreadFeedClient();
  const response = await client.get_publicCommunitiesCommunityRefFeed({
    path: { communityRef: options.communityRef },
    query: {
      surface: "threads",
      sort: "new",
      locale: options.locale ?? "en",
      ...(options.cursor ? { cursor: options.cursor } : {}),
    },
  });
  return normalizeCommunityThreadPage(response);
}
