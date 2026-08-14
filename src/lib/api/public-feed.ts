import { getRequestEvent } from "@solidjs/web";
import { createApiClient } from "./client";

export interface PublicVideoMedia {
  mime_type?: string | null;
  poster_ref?: string | null;
  poster_width?: number | null;
  poster_height?: number | null;
  storage_ref?: string | null;
}

export interface PublicVideoPost {
  id: string;
  title?: string | null;
  caption?: string | null;
  author_user?: string | null;
  author_public_handle?: string | null;
  media_refs?: PublicVideoMedia[] | null;
}

export interface PublicVideoFeedItem {
  post: {
    post: PublicVideoPost;
    comment_count?: number | null;
    like_count?: number | null;
    upvote_count?: number | null;
  };
  community?: {
    display_name?: string | null;
    route_slug?: string | null;
    avatar_ref?: string | null;
  } | null;
}

export interface PublicVideoFeedPage {
  items: PublicVideoFeedItem[];
  next_cursor: string | null;
}

export const publicVideoFeedKey = (cursor: string | null = null) =>
  ["feed", "public-videos", "en", "best", cursor] as const;

/**
 * The API's keyset cursor is backed by PG NUMERIC and may arrive as a number
 * in a fixture even though production returns a string. Never turn it into a
 * JS number: precision loss would make the next page non-deterministic.
 */
export function normalizeKeysetCursor(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new Error("Invalid public feed keyset cursor");
}

/**
 * Some older public responses contain `usr_usr_<id>`. Normalize exactly one
 * duplicate prefix while preserving ordinary `usr_<id>` values.
 */
export function normalizeAuthorUser(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.startsWith("usr_usr_") ? value.slice("usr_".length) : value;
}

function requestForFeed(): Request | undefined {
  const serverRequest = getRequestEvent()?.request;
  if (serverRequest) return serverRequest;
  if (typeof window === "undefined") return undefined;

  const url = new URL(window.location.href);
  // Local preview has no API Worker. Use the canonical public surface for
  // browser pagination; the server-side middleware already does this for SSR.
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.startsWith("127.")) {
    url.hostname = "app.pirate.sc";
  }
  return new Request(url);
}

function fetchWithTimeout(timeoutMs = 4_000): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

export function normalizePublicVideoFeed(input: unknown): PublicVideoFeedPage {
  if (!input || typeof input !== "object") throw new Error("Invalid public video feed response");
  const payload = input as { items?: unknown; next_cursor?: unknown };
  const items = Array.isArray(payload.items)
    ? payload.items.filter((item): item is PublicVideoFeedItem => {
      if (!item || typeof item !== "object") return false;
      const post = (item as { post?: unknown }).post;
      return Boolean(post && typeof post === "object" && (post as { post?: unknown }).post);
    }).map(item => {
      const post = item.post.post;
      return {
        ...item,
        post: {
          ...item.post,
          post: {
            ...post,
            author_user: normalizeAuthorUser(post.author_user),
          },
        },
      };
    })
    : [];
  return { items, next_cursor: normalizeKeysetCursor(payload.next_cursor) };
}

export async function fetchPublicVideoFeed(cursor: string | null = null): Promise<PublicVideoFeedPage> {
  const query = new URLSearchParams({ locale: "en", sort: "best" });
  if (cursor) query.set("cursor", cursor);
  const response = await createApiClient({ request: requestForFeed(), fetchImpl: fetchWithTimeout() }).getJson<unknown>(
    `/feed/home/videos/public?${query.toString()}`,
  );
  return normalizePublicVideoFeed(response);
}

export function createPublicVideoFeedQuery(cursor: string | null = null) {
  const initialData = cursor === null ? getRequestEvent()?.locals?.publicVideoFeed as PublicVideoFeedPage | undefined : undefined;
  return {
    queryKey: publicVideoFeedKey(cursor),
    queryFn: () => fetchPublicVideoFeed(cursor),
    staleTime: 5 * 60_000,
    initialData,
    retry: false,
    enabled: cursor === null || Boolean(cursor),
  };
}
