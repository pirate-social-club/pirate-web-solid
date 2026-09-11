import { getRequestEvent } from "@solidjs/web";

import { SESSION_COOKIE_NAME } from "../api/session.ts";

/**
 * True when the SSR request carried the session cookie, or when the document
 * the client hydrated from said so. Used only while the account identity is
 * unresolved: the explicit identity read stays authoritative, so a stale
 * cookie costs at most a one-time correction instead of a layout jump. The
 * community HTML is `no-store`, so the hint cannot leak through a cache.
 */
export function viewerSessionHint(): boolean {
  const event = getRequestEvent();
  if (event !== undefined) {
    const cookie = event.request.headers.get("cookie") ?? "";
    return cookie.includes(`${SESSION_COOKIE_NAME}=`);
  }
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.viewerSession === "present";
}
