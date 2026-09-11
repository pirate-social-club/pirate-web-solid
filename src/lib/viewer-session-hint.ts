import { getRequestEvent } from "@solidjs/web";

import { SESSION_COOKIE_NAME } from "../api/headers.ts";

/** Exact-name cookie match; a suffix lookalike is not the session cookie. */
function requestHasSessionCookie(request: Request): boolean {
  const cookie = request.headers.get("cookie");
  if (cookie === null) return false;
  for (const pair of cookie.split(";")) {
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    if (pair.slice(0, separator).trim() === SESSION_COOKIE_NAME) return true;
  }
  return false;
}

/**
 * True when the SSR request carried the session cookie, or when the document
 * the client hydrated from said so. Used only while the account identity is
 * unresolved: the explicit identity read stays authoritative, so a stale
 * cookie costs at most a one-time correction instead of a layout jump. The
 * community HTML is `no-store`, so the hint cannot leak through a cache.
 *
 * The optional request is the test seam; the cookie-name parse is pinned with
 * literal header strings rather than with the constant.
 */
export function viewerSessionHint(request?: Request): boolean {
  if (request !== undefined) return requestHasSessionCookie(request);
  const event = getRequestEvent();
  if (event !== undefined) return requestHasSessionCookie(event.request);
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.viewerSession === "present";
}
