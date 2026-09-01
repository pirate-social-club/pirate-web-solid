/*
 * These feed operations intentionally use the newer reviewed client alias. The
 * base client remains pinned for unrelated surfaces, but its older feed schema
 * rejects api-next's nullable source hashes and age-locked projection items.
 */
import {
  createPirateApiClient,
  type GetFeedHomePublicResponse,
  type PirateApiClient,
} from "@pirate/api-client-happy-path";
import {
  createGeneratedApiClient,
  type ApiClientFactoryOptions,
} from "../../../api/client.ts";
import {
  resolveLocaleLanguageTag,
  type UiLocaleCode,
} from "../../../lib/ui-locale-core.ts";
import type { ApiFetch } from "../../../api/proxy.ts";
import type { FeedSort } from "./feed-model.ts";

export type PublicFeedClient = Pick<PirateApiClient, "get_feedHomePublic">;

/** Use the reviewed client whose feed schema includes nullable hashes and age locks. */
export function createPublicFeedClient(options: ApiClientFactoryOptions = {}): PublicFeedClient {
  return createGeneratedApiClient(createPirateApiClient, options, { credentials: "omit" });
}

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | JsonRecord;
type JsonRecord = { readonly [key: string]: JsonValue };

export interface PublicFeedCommunity {
  readonly id: string;
  readonly displayName: string;
  readonly routeSlug: string | null;
  readonly avatarRef: string | null;
  readonly videoFeedEnabled: boolean | null;
  readonly memberCount: number | null;
  readonly followerCount: number | null;
  readonly viewCount: number | null;
}

export interface PublicFeedItem {
  readonly id: string;
  readonly communityId: string;
  readonly communityName: string;
  readonly communityRouteSlug: string | null;
  readonly communityAvatarRef: string | null;
  readonly authorUser: string | null;
  readonly authorPersonaId?: string | null;
  readonly authorDisplayName?: string | null;
  readonly authorAvatarRef?: string | null;
  readonly authorPrimaryPublicHandle?: string | null;
  readonly authorPublicHandle: string | null;
  readonly anonymousLabel: string | null;
  readonly identityMode: "public" | "anonymous";
  readonly authorshipMode: "human_direct" | "user_agent";
  readonly postType: "text" | "image" | "video" | "link" | "song" | "crosspost" | "file";
  readonly status: "draft" | "processing" | "published" | "failed" | "hidden" | "removed" | "deleted";
  readonly visibility: "public" | "members_only";
  readonly title: string | null;
  readonly body: string | null;
  readonly caption: string | null;
  readonly createdAt: string;
  readonly mediaRefs: readonly unknown[] | null;
  readonly analysisState: "pending" | "allow" | "allow_with_required_reference" | "review_required" | "blocked";
  readonly contentSafetyState: "pending" | "safe" | "sensitive" | "adult";
  readonly ageGatePolicy: "none" | "18_plus";
  readonly upvoteCount: number | null;
  readonly downvoteCount: number | null;
  readonly likeCount: number | null;
  readonly commentCount: number | null;
  readonly viewerVote: -1 | 1 | null;
  readonly translationState: "ready" | "pending" | "failed" | "same_language" | "policy_blocked";
  readonly machineTranslated: boolean;
  readonly translatedTitle: string | null;
  readonly translatedBody: string | null;
  readonly translatedCaption: string | null;
};

export interface PublicFeedPage {
  readonly items: readonly PublicFeedItem[];
  readonly topCommunities: readonly PublicFeedCommunity[];
  readonly nextCursor: string | null;
}

export type FeedPage = PublicFeedPage;

export interface PublicFeedRequestOptions {
  readonly client?: PublicFeedClient;
  readonly cursor?: string | null;
  readonly locale?: UiLocaleCode;
  readonly sort?: FeedSort;
  readonly timeRange?: "hour" | "day" | "week" | "month" | "year" | "all";
  readonly request?: Request;
  readonly origin?: string | URL;
  readonly fetchImpl?: ApiFetch;
  readonly timeoutMs?: number;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  for (const candidate of values) if (candidate === value) return candidate;
  return null;
}

function normalizeKeysetCursor(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new Error("Invalid public feed keyset cursor");
}

function createdAt(value: unknown): string | null {
  const seconds = finiteNumber(value);
  if (seconds === null) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeMediaRefs(value: unknown): readonly unknown[] | null {
  return Array.isArray(value) ? value.slice() : null;
}

function normalizeCommunity(value: unknown): PublicFeedCommunity | null {
  if (!isRecord(value)) return null;
  const id = nullableString(value.id);
  const displayName = nullableString(value.display_name);
  if (!id || !displayName) return null;
  return {
    id,
    displayName,
    routeSlug: nullableString(value.route_slug),
    avatarRef: nullableString(value.avatar_ref),
    videoFeedEnabled: typeof value.video_feed_enabled === "boolean" ? value.video_feed_enabled : null,
    memberCount: finiteNumber(value.member_count),
    followerCount: finiteNumber(value.follower_count),
    viewCount: finiteNumber(value.view_count),
  };
}

function normalizeFeedItem(value: unknown): PublicFeedItem | null {
  if (!isRecord(value) || !isRecord(value.post)) return null;
  const envelope = value.post;
  if (!isRecord(envelope.post)) return null;
  const post = envelope.post;
  const community = normalizeCommunity(value.community);
  const id = nullableString(post.id);
  const created = createdAt(post.created);
  const identityMode = oneOf(post.identity_mode, ["public", "anonymous"] as const);
  const authorshipMode = oneOf(post.authorship_mode, ["human_direct", "user_agent"] as const);
  const postType = oneOf(post.post_type, ["text", "image", "video", "link", "song", "crosspost", "file"] as const);
  const status = oneOf(post.status, ["draft", "processing", "published", "failed", "hidden", "removed", "deleted"] as const);
  const visibility = oneOf(post.visibility, ["public", "members_only"] as const);
  const analysisState = oneOf(post.analysis_state, ["pending", "allow", "allow_with_required_reference", "review_required", "blocked"] as const);
  const contentSafetyState = oneOf(post.content_safety_state, ["pending", "safe", "sensitive", "adult"] as const);
  const ageGatePolicy = oneOf(post.age_gate_policy, ["none", "18_plus"] as const);
  const translationState = oneOf(envelope.translation_state, ["ready", "pending", "failed", "same_language", "policy_blocked"] as const);
  if (!id || !community || !created || !identityMode || !authorshipMode || !postType || !status || !visibility || !analysisState || !contentSafetyState || !ageGatePolicy || !translationState) return null;

  const viewerVote = envelope.viewer_vote === -1 || envelope.viewer_vote === 1 ? envelope.viewer_vote : null;
  const authorPersona = isRecord(post.author_persona) ? post.author_persona : null;
  return {
    id,
    communityId: community.id,
    communityName: community.displayName,
    communityRouteSlug: community.routeSlug,
    communityAvatarRef: community.avatarRef,
    authorUser: nullableString(post.author_user),
    authorPersonaId: nullableString(authorPersona?.persona_id),
    authorDisplayName: nullableString(authorPersona?.display_name),
    authorAvatarRef: nullableString(authorPersona?.avatar_ref),
    authorPrimaryPublicHandle: nullableString(authorPersona?.primary_public_handle),
    authorPublicHandle: nullableString(post.author_public_handle),
    anonymousLabel: nullableString(post.anonymous_label),
    identityMode,
    authorshipMode,
    postType,
    status,
    visibility,
    title: nullableString(post.title),
    body: nullableString(post.body),
    caption: nullableString(post.caption),
    createdAt: created,
    mediaRefs: normalizeMediaRefs(post.media_refs),
    analysisState,
    contentSafetyState,
    ageGatePolicy,
    upvoteCount: finiteNumber(envelope.upvote_count),
    downvoteCount: finiteNumber(envelope.downvote_count),
    likeCount: finiteNumber(envelope.like_count),
    commentCount: finiteNumber(envelope.comment_count),
    viewerVote,
    translationState,
    machineTranslated: envelope.machine_translated === true,
    translatedTitle: nullableString(envelope.translated_title),
    translatedBody: nullableString(envelope.translated_body),
    translatedCaption: nullableString(envelope.translated_caption),
  };
}

export function normalizeFeedPage(value: unknown): FeedPage {
  if (!isRecord(value)) throw new Error("Invalid public feed response");
  const items = Array.isArray(value.items)
    ? value.items.flatMap(item => {
      const normalized = normalizeFeedItem(item);
      return normalized ? [normalized] : [];
    })
    : [];
  const topCommunities = Array.isArray(value.top_communities)
    ? value.top_communities.flatMap(community => {
      const normalized = normalizeCommunity(community);
      return normalized ? [normalized] : [];
    })
    : [];
  return {
    items,
    topCommunities,
    nextCursor: normalizeKeysetCursor(value.next_cursor),
  };
}

/** Backward-compatible name for the signed-out adapter's boundary tests. */
export const normalizePublicFeed = normalizeFeedPage;

function resolveRequestOrigin(options: Pick<PublicFeedRequestOptions, "origin" | "request">): string | URL | undefined {
  if (options.origin !== undefined) return options.origin;
  if (options.request !== undefined) return new URL(options.request.url).origin;
  return typeof location === "undefined" ? undefined : location.origin;
}

function boundedFetch(fetchImpl: ApiFetch, timeoutMs: number): ApiFetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Fetches the generated signed-out operation without forwarding browser auth. */
export async function fetchPublicFeedPage(options: PublicFeedRequestOptions = {}): Promise<PublicFeedPage> {
  const locale = options.locale ?? "en";
  type PublicFeedQuery = NonNullable<Parameters<PublicFeedClient["get_feedHomePublic"]>[0]["query"]>;
  const query: PublicFeedQuery = {
    locale: resolveLocaleLanguageTag(locale),
    sort: options.sort ?? "best",
    ...(options.cursor ? { cursor: options.cursor } : {}),
    ...(options.timeRange ? { time_range: options.timeRange } : {}),
  };

  const client = options.client ?? createPublicFeedClient({
    origin: resolveRequestOrigin(options),
    fetchImpl: boundedFetch(options.fetchImpl ?? fetch, options.timeoutMs ?? 4_000),
  });
  const response: GetFeedHomePublicResponse = await client.get_feedHomePublic({ query });
  return normalizeFeedPage(response);
}
