import type { CreateVideoPlaybackAccessResponse } from "@pirate/api-client";
import { createApiClient, readCsrfCookie, sessionRequestOptions } from "../../../api/client";

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
    || expires * 1000 <= now || expires * 1000 > now + 300_000
    || renew * 1000 <= now || renew >= expires) throw new Error("Video access is unavailable");
  return { url: url.href, expiresAt: expires * 1000, renewAt: renew * 1000 };
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
