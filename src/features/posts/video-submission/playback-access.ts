import type { CreateVideoPlaybackAccessResponse } from "@pirate/api-client";
import { createApiClient, readCsrfCookie, sessionRequestOptions } from "../../../api/client";

const MAX_GRANT_LIFETIME_MS = 300_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 60_000;
const RENEWAL_MARGIN_MS = 60_000;
const MIN_RENEWAL_DELAY_MS = 10_000;

export interface PlaybackGrant { readonly url: string; readonly expiresAt: number; readonly renewAt: number }
/** Access responses, never feed references, are the sole source of media URLs. */
export function validatePlaybackGrant(value: CreateVideoPlaybackAccessResponse, now = Date.now()): PlaybackGrant {
  const url = new URL(value.playback_url);
  const expires = value.expires_at, renew = value.renew_after;
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash
    || !/^customer-[a-z0-9]+\.cloudflarestream\.com$/u.test(url.hostname)
    || !/^\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/manifest\/video\.m3u8$/u.test(url.pathname)
    || typeof expires !== "number" || typeof renew !== "number"
    || !Number.isSafeInteger(expires) || !Number.isSafeInteger(renew)
    || expires * 1000 <= now || expires * 1000 > now + MAX_GRANT_LIFETIME_MS + MAX_FUTURE_CLOCK_SKEW_MS
    || renew <= 0 || renew >= expires) throw new Error("Video access is unavailable");
  // Tolerate a behind-clock client without extending its local five-minute fence.
  // Stream still enforces the signed token's server-side expiration.
  const expiresAt = Math.min(expires * 1000, now + MAX_GRANT_LIFETIME_MS);
  // An already-due server renewal is usable, but must not create a hot mint loop.
  // If less than the minimum delay remains, the player's expiry fence wins.
  const renewAt = Math.min(expiresAt, Math.max(now + MIN_RENEWAL_DELAY_MS,
    Math.min(renew * 1000, expiresAt - RENEWAL_MARGIN_MS)));
  return { url: url.href, expiresAt, renewAt };
}
export async function mintPlaybackAccess(postId: string, signal: AbortSignal): Promise<PlaybackGrant> {
  const csrf = readCsrfCookie();
  const options = csrf ? sessionRequestOptions(csrf, { signal }) : { credentials: "same-origin" as const, signal };
  return validatePlaybackGrant(await createApiClient().post_postsPostIdVideoPlaybackAccess({ path: { postId } }, options));
}
/** The cookie-authorized route rechecks visibility even on conditional requests. */
export function videoPosterPath(postId: string): string {
  if (!postId.trim()) throw new Error("Video identifier is missing");
  return `/api/posts/${encodeURIComponent(postId)}/video/poster`;
}
