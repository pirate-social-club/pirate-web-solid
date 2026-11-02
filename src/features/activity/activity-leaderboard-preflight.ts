import type { PirateApiClientOptions } from "@pirate/api-client";
import { createCanonicalCommunityRouteClient } from "../../api/community-route-client.ts";
import { validateApiNextOrigin } from "../../api/origin.ts";
import type { ApiFetch } from "../../api/proxy.ts";
import { loadCommunityPage, type CommunityPageViewState } from "../communities/community-page/community-page.model.ts";
import { decodeCommunityRouteParam } from "../communities/community-page/community-page-preflight.ts";
import { resolvePublicPostPreflight } from "../posts/public-post/public-post-preflight.ts";
import type { PublicPostRouteState } from "../posts/public-post/public-post-route.model.ts";
import { leaderboardRedirectHref } from "./activity-leaderboard-navigation.ts";

export type ActivityLeaderboardPreflight =
  | { readonly kind: "community"; readonly requestPath: string; readonly value: string; readonly state: CommunityPageViewState }
  | { readonly kind: "song"; readonly requestPath: string; readonly identity: "id" | "slug"; readonly value: string; readonly state: PublicPostRouteState }
  | { readonly kind: "method-not-allowed"; readonly requestPath: string };

/** No website self-fetch. Public community metadata never receives viewer credentials. */
export async function resolveActivityLeaderboardPreflight(request: Request, apiNextOrigin: string | undefined, canonicalOrigin: string | undefined, fetchImpl: ApiFetch = fetch): Promise<ActivityLeaderboardPreflight | undefined> {
  const url = new URL(request.url);
  const match = /^\/(c|post|posts)\/([^/]+)\/leaderboard\/?$/u.exec(url.pathname);
  if (!match) return undefined;
  if (request.method !== "GET" && request.method !== "HEAD") return { kind: "method-not-allowed", requestPath: url.pathname };
  if (match[1] === "c") {
    const value = decodeCommunityRouteParam(match[2]);
    let origin: URL;
    try { origin = validateApiNextOrigin(apiNextOrigin); }
    catch { return { kind: "community", requestPath: url.pathname, value, state: { kind: "unavailable", status: 502 } }; }
    const options: PirateApiClientOptions = { credentials: "omit", signal: request.signal,
      // SAFETY: generated transport invokes the same standard fetch call shape as ApiFetch.
      fetchImpl: fetchImpl as typeof fetch,
    };
    const state = await loadCommunityPage(createCanonicalCommunityRouteClient(`${origin.origin}/`, options), value, canonicalOrigin);
    return { kind: "community", requestPath: url.pathname, value, state };
  }
  const identity = match[1] === "post" ? "id" : "slug";
  const value = identity === "id" ? decodeCommunityRouteParam(match[2]) : match[2];
  const base = new URL(url); base.pathname = url.pathname.replace(/\/leaderboard\/?$/u, ""); base.search = "";
  const locale = url.searchParams.get("locale"); if (locale !== null) base.searchParams.set("locale", locale);
  // The existing public-post preflight owns the exact session-cookie/age policy.
  const post = await resolvePublicPostPreflight(new Request(base, request), apiNextOrigin, canonicalOrigin, fetchImpl);
  const state = post?.state ?? { kind: "unavailable", status: 502 } as const;
  return { kind: "song", requestPath: url.pathname, identity, value, state: state.kind === "redirect" ? { ...state, location: leaderboardRedirectHref(`${state.location}/leaderboard`, url.searchParams.get("from")) } : state };
}
