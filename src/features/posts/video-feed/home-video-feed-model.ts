import type { MediaPostData } from "@pirate/web-solid-ui";
import { buildPublicProfilePath } from "../../profiles/public-profile-page/public-profile-page.model.ts";
import type { PublicFeedItem } from "../feed/public-feed-adapter.ts";

interface MediaReferenceCandidate {
  readonly playback_url?: unknown;
  readonly playbackUrl?: unknown;
  readonly video_url?: unknown;
  readonly videoUrl?: unknown;
  readonly poster_url?: unknown;
  readonly posterUrl?: unknown;
  readonly thumbnail_url?: unknown;
  readonly thumbnailUrl?: unknown;
  readonly url?: unknown;
  readonly href?: unknown;
}

export interface HomeVideoPost extends MediaPostData {
  readonly destination: string;
  readonly communityDestination: string;
}

function isRecord(value: unknown): value is MediaReferenceCandidate {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Accept only browser-safe public or application-relative media locations. */
export function safeMediaUrl(value: unknown): string | undefined {
  const candidate = nonEmptyString(value);
  if (!candidate || candidate.startsWith("//")) return undefined;
  if (candidate.startsWith("/")) return candidate;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function firstSafeUrl(
  record: MediaReferenceCandidate,
  keys: readonly (keyof MediaReferenceCandidate)[],
): string | undefined {
  for (const key of keys) {
    const resolved = safeMediaUrl(record[key]);
    if (resolved) return resolved;
  }
  return undefined;
}

export interface ResolvedVideoMedia {
  readonly videoUrl: string;
  readonly posterUrl?: string;
}

/**
 * Media references are still an open JSON projection in api-next. Keep this
 * decoder deliberately small and fail closed until that contract is typed.
 */
export function resolveVideoMedia(refs: readonly unknown[] | null): ResolvedVideoMedia | null {
  if (!refs) return null;
  let posterUrl: string | undefined;
  for (const reference of refs) {
    if (typeof reference === "string") {
      const videoUrl = safeMediaUrl(reference);
      if (videoUrl) return { videoUrl, ...(posterUrl ? { posterUrl } : {}) };
      continue;
    }
    if (!isRecord(reference)) continue;
    posterUrl ??= firstSafeUrl(reference, ["poster_url", "posterUrl", "thumbnail_url", "thumbnailUrl"]);
    const videoUrl = firstSafeUrl(reference, ["playback_url", "playbackUrl", "video_url", "videoUrl", "url", "href"]);
    if (videoUrl) return { videoUrl, ...(posterUrl ? { posterUrl } : {}) };
  }
  return null;
}

function communityDestination(item: PublicFeedItem): string {
  return `/c/${encodeURIComponent(item.communityRouteSlug ?? item.communityId)}`;
}

export function publisherDestination(item: PublicFeedItem): string {
  if (item.identityMode === "public") {
    const handle = item.authorPrimaryPublicHandle ?? item.authorPublicHandle;
    if (handle) return buildPublicProfilePath(handle.replace(/^@+/u, ""));
    if (item.authorPersonaId) return `/p/${encodeURIComponent(item.authorPersonaId)}`;
  }
  return communityDestination(item);
}

function publisherName(item: PublicFeedItem): string {
  if (item.identityMode === "public") {
    return (item.authorPrimaryPublicHandle ?? item.authorPublicHandle ?? item.authorDisplayName ?? item.authorUser ?? "creator")
      .replace(/^@+/u, "");
  }
  return item.communityName;
}

function caption(item: PublicFeedItem): string | undefined {
  if (item.translationState === "ready" && item.translatedCaption) return item.translatedCaption;
  return item.caption ?? item.body ?? item.title ?? undefined;
}

export function toHomeVideoPost(item: PublicFeedItem): HomeVideoPost | null {
  if (item.postType !== "video" || item.status !== "published") return null;
  const media = resolveVideoMedia(item.mediaRefs);
  if (!media) return null;
  const destination = communityDestination(item);
  const avatarUrl = safeMediaUrl(item.authorAvatarRef ?? item.communityAvatarRef);
  const postCaption = caption(item);
  return {
    id: item.id,
    videoUrl: media.videoUrl,
    ...(media.posterUrl ? { posterUrl: media.posterUrl } : {}),
    authorName: publisherName(item),
    ...(avatarUrl ? { authorAvatarUrl: avatarUrl } : {}),
    ...(postCaption ? { caption: postCaption } : {}),
    likeCount: item.likeCount ?? item.upvoteCount ?? 0,
    isLiked: item.viewerVote === 1,
    destination: publisherDestination(item),
    communityDestination: destination,
  };
}

export function playableHomeVideos(items: readonly PublicFeedItem[]): HomeVideoPost[] {
  return items.flatMap(item => {
    const post = toHomeVideoPost(item);
    return post ? [post] : [];
  });
}

export function unplayableVideoCount(items: readonly PublicFeedItem[]): number {
  return items.filter(item => item.postType === "video" && item.status === "published" && resolveVideoMedia(item.mediaRefs) === null).length;
}
