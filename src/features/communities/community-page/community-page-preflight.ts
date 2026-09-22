import { createPirateApiClient, type PirateApiClientOptions } from "@pirate/api-client";
import { validateApiNextOrigin } from "../../../api/origin.ts";
import type { ApiFetch } from "../../../api/proxy.ts";
import { loadCommunityThreadPage } from "./community-thread-feed-api.ts";
import { reportCommunityFeedFailure } from "./community-feed-diagnostic.ts";
import {
  loadCommunityPage,
  normalizeCommunityPathSegment,
  type CommunityPageViewState,
} from "./community-page.model.ts";

export const COMMUNITY_PAGE_HTML_CACHE_CONTROL = "no-store";

export type CommunityPagePreflight = Readonly<{
  readonly requestedPathSegment: string;
  readonly state: CommunityPageViewState;
}>;

export type CommunityPageResponsePolicy = Readonly<{
  readonly status: 200 | 400 | 404 | 502;
  readonly statusText?: string;
  readonly headers: Headers;
}>;

export function decodeCommunityRouteParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Extract exactly one path segment and decode it exactly once. */
export function communityPathSegmentFromRequest(request: Request): string | undefined {
  const match = /^\/c\/([^/]+)$/u.exec(new URL(request.url).pathname);
  return match?.[1] === undefined ? undefined : decodeCommunityRouteParam(match[1]);
}

export async function resolveCommunityPagePreflight(
  request: Request,
  apiNextOrigin: string | undefined,
  fetchImpl: ApiFetch = fetch,
): Promise<CommunityPagePreflight | undefined> {
  const requestedPathSegment = communityPathSegmentFromRequest(request);
  if (requestedPathSegment === undefined) return undefined;
  if (normalizeCommunityPathSegment(requestedPathSegment) === null) {
    return { requestedPathSegment, state: { kind: "invalid", status: 400 } };
  }

  let origin: URL;
  try {
    origin = validateApiNextOrigin(apiNextOrigin);
  } catch {
    return { requestedPathSegment, state: { kind: "unavailable", status: 502 } };
  }

  const options: PirateApiClientOptions = {
    credentials: "omit",
    signal: request.signal,
    // SAFETY: ApiFetch has the generated client's standard fetch call shape.
    fetchImpl: fetchImpl as typeof fetch,
  };
  const client = createPirateApiClient(`${origin.origin}/`, options);
  const state = await loadCommunityPage(client, requestedPathSegment, new URL(request.url).origin);
  if (state.kind !== "success") return { requestedPathSegment, state };
  try {
    // Reuse the direct, credential-free API client. Never fetch this Worker's
    // public /api proxy from SSR. The route already serializes state for hydration.
    const page = await loadCommunityThreadPage({ client, communityRef: state.communityId });
    return { requestedPathSegment, state: { ...state, initialFeed: {
      kind: "ready", posts: page.posts, ageLockedCount: page.ageLockedCount,
    } } };
  } catch (error) {
    reportCommunityFeedFailure(error, "preflight");
    return { requestedPathSegment, state: { ...state, initialFeed: { kind: "error" } } };
  }
}

export function communityPageResponsePolicy(state: CommunityPageViewState): CommunityPageResponsePolicy {
  const headers = new Headers({
    "Cache-Control": COMMUNITY_PAGE_HTML_CACHE_CONTROL,
    Vary: "Accept-Language",
  });
  if (state.kind === "success") return { status: 200, headers };
  if (state.kind === "invalid") return { status: 400, statusText: "Bad Request", headers };
  if (state.kind === "not-found") return { status: 404, statusText: "Not Found", headers };
  return { status: 502, statusText: "Bad Gateway", headers };
}
