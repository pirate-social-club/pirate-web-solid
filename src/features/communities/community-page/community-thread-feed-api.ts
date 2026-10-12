import {
  createPirateApiClient,
  type GetPublicCommunitiesCommunityRefFeedResponse,
  type PirateApiClient,
} from "@pirate/api-client";

import {
  createGeneratedApiClient,
  type ApiClientFactoryOptions,
} from "../../../api/client.ts";
import type { CommunityPost, CommunityPostKind } from "../../community/page-shell/page-shell-model.ts";
import { projectVideoDelivery } from "../../posts/video-submission/delivery-state.ts";
import { publicProfileLabel } from "../../identity/public-profile-label.ts";

export type CommunityThreadFeedClient = Pick<PirateApiClient, "get_publicCommunitiesCommunityRefFeed">;

export interface CommunityThreadPage {
  readonly posts: readonly CommunityPost[];
  readonly nextCursor: string | null;
  readonly ageLockedCount?: number;
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
type ThreadPost = Exclude<ThreadItem, { readonly kind: "age_locked" }>;

/**
 * The card renders three kinds. Any other post type is left out rather than
 * drawn as a text card, so a type the server starts returning degrades to
 * absence and never to a wrong card.
 */
function cardKind(postType: ThreadPost["post"]["post_type"]): CommunityPostKind | null {
  return postType === "text" || postType === "song" || postType === "video" ? postType : null;
}

/** The referenced song names a video's soundtrack line; titles are never guessed. */
function soundtrackTitle(video: ThreadPost["video"]): string | undefined {
  return video?.soundtrack.kind === "song_reference" ? video.soundtrack.song_reference.song_title.trim() || undefined : undefined;
}

export function projectCommunityThreadPost(item: ThreadItem): CommunityPost | null {
  if ("kind" in item) return null;
  const post = item.post;
  if (post.status !== "published") return null;
  const kind = cardKind(post.post_type);
  if (kind === null) return null;
  const created = typeof post.created === "number" ? new Date(post.created * 1_000) : null;
  if (created === null || Number.isNaN(created.getTime())) return null;
  const persona = post.author_persona;
  const authorHandle = post.identity_mode === "anonymous"
    ? post.anonymous_label ?? "Anonymous"
    : publicProfileLabel(persona, undefined, post.author_public_handle);
  const title = post.title ?? post.caption ?? (post.post_type === "song" ? post.song_title : null) ?? post.post_type;
  const body = post.body ?? post.caption ?? "";
  const upvoteCount = finiteCount(item.upvote_count);
  const downvoteCount = finiteCount(item.downvote_count);
  return {
    id: post.id,
    title,
    body,
    score: upvoteCount - downvoteCount,
    // The server sends both sides. Carry them rather than only their
    // difference, because nothing downstream can recover them from it.
    upvoteCount,
    downvoteCount,
    publishedAt: created.toISOString(),
    authorHandle,
    authorPublicHandle: post.identity_mode === "anonymous" ? undefined : post.author_public_handle,
    authorProfile: post.identity_mode === "anonymous" ? undefined : persona ?? null,
    authorPersonaId: post.identity_mode === "anonymous" ? undefined : persona?.persona_id,
    authorAvatarSrc: post.identity_mode === "anonymous" ? null : persona?.avatar_ref ?? null,
    kind,
    supportsPostReports: kind === "text",
    ...(kind === "song" && post.song_title ? { mediaTitle: post.song_title } : {}),
    ...(kind === "video" ? {
      video: projectVideoDelivery(item.video),
      requiresAgeVerification: post.age_gate_policy === "18_plus",
      ...(soundtrackTitle(item.video) ? { mediaTitle: soundtrackTitle(item.video) } : {}),
    } : {}),
    commentCount: finiteCount(item.comment_count),
    // Being a song is not a Learn or Karaoke capability. These were derived
    // from post_type alone, which put two buttons with no handlers behind them
    // on every song. The real capability is a server projection this surface
    // does not carry, so nothing is claimed here until it does.
  };
}

export function normalizeCommunityThreadPage(
  response: GetPublicCommunitiesCommunityRefFeedResponse,
): CommunityThreadPage {
  return {
    posts: response.items.flatMap(item => {
      const projected = projectCommunityThreadPost(item);
      return projected ? [projected] : [];
    }),
    ...(response.items.some(item => "kind" in item) ? { ageLockedCount: response.items.filter(item => "kind" in item).length } : {}),
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
