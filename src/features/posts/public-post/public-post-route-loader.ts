import { query } from "@solidjs/router";
import { getRequestEvent, httpHeader, httpStatus } from "@solidjs/web";
import { createSessionApiClient } from "../../../api/client.ts";
import {
  loadPublicPostById,
  loadPublicPostBySlug,
  type PublicPostActivity,
  type PublicPostRouteState,
} from "./public-post-route.model.ts";
import {
  publicPostResponsePolicy,
  resolvePublicPostLocale,
  type PublicPostPreflight,
} from "./public-post-preflight.ts";

function currentPath(): string {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url).pathname;
  return typeof location === "undefined" ? "/" : location.pathname;
}

function currentOrigin(): string | undefined {
  const event = getRequestEvent();
  if (event !== undefined) return new URL(event.request.url).origin;
  return typeof location === "undefined" ? undefined : location.origin;
}

function currentCanonicalOrigin(): string | undefined {
  const event = getRequestEvent();
  if (event !== undefined) {
    // SAFETY: entry-server is the sole writer for this request-local key and
    // stores only the optional canonical-origin string from the Worker context.
    return (event.locals as typeof event.locals & { publicAppCanonicalOrigin?: string })
      .publicAppCanonicalOrigin;
  }
  return typeof document === "undefined"
    ? undefined
    : document.documentElement.dataset.publicAppCanonicalOrigin;
}

function currentLocale(): string {
  const event = getRequestEvent();
  if (event !== undefined) {
    return resolvePublicPostLocale(
      new URL(event.request.url),
      event.request.headers.get("accept-language"),
    );
  }
  return resolvePublicPostLocale(
    new URL(typeof location === "undefined" ? "https://pirate.invalid/" : location.href),
    typeof navigator === "undefined" ? undefined : navigator.language,
  );
}

function commit(state: PublicPostRouteState): void {
  if (state.kind === "redirect") {
    if (typeof location !== "undefined") location.replace(state.location);
    return;
  }
  if (getRequestEvent() === undefined) return;
  const policy = publicPostResponsePolicy(state);
  httpStatus(policy.status, policy.statusText);
  policy.headers.forEach((value, name) => httpHeader(name, value));
}

function settled(requestPath: string): PublicPostRouteState | undefined {
  // SAFETY: entry-server is the sole writer for this request-local key and
  // stores only a PublicPostPreflight for the current request.
  const preflight = getRequestEvent()?.locals.publicPostPreflight as PublicPostPreflight | undefined;
  return preflight?.requestPath === requestPath ? preflight.state : undefined;
}

export async function loadSlugRoute(
  rawSlug: string,
  activity: PublicPostActivity,
  locale: string,
  canonicalOrigin: string | undefined,
): Promise<PublicPostRouteState> {
  const requestPath = currentPath();
  const preflight = settled(requestPath);
  if (preflight !== undefined) return preflight;
  const state = await loadPublicPostBySlug({
    activity,
    canonicalOrigin,
    client: createSessionApiClient({ origin: currentOrigin() }),
    locale,
    rawSlug,
    requestPath,
  });
  commit(state);
  return state;
}

export async function loadLegacyRoute(
  postId: string,
  activity: Exclude<PublicPostActivity, "detail">,
  locale: string,
  canonicalOrigin: string | undefined,
): Promise<PublicPostRouteState> {
  const requestPath = currentPath();
  const preflight = settled(requestPath);
  if (preflight !== undefined) return preflight;
  const state = await loadPublicPostById({
    activity,
    canonicalOrigin,
    client: createSessionApiClient({ origin: currentOrigin() }),
    locale,
    postId,
    requestPath,
  });
  commit(state);
  return state;
}

export const queryPublicPostSlugRoute = query(loadSlugRoute, "public-post-slug-route");
export const queryPublicPostLegacyRoute = query(loadLegacyRoute, "public-post-legacy-route");

export function preloadPublicPostSlugRoute(rawSlug: string, activity: PublicPostActivity) {
  return queryPublicPostSlugRoute(rawSlug, activity, currentLocale(), currentCanonicalOrigin());
}

export function preloadPublicPostLegacyRoute(
  postId: string,
  activity: Exclude<PublicPostActivity, "detail">,
) {
  return queryPublicPostLegacyRoute(postId, activity, currentLocale(), currentCanonicalOrigin());
}
