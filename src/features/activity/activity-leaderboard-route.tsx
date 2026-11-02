import { query } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { getRequestEvent, httpHeader, httpStatus } from "@solidjs/web";
import { Loading, Show, createMemo } from "solid-js";
import { createSessionApiClient } from "../../api/client.ts";
import { createPublicCommunityRouteClient } from "../../api/community-route-client.ts";
import { captureSessionAuthority } from "../../api/browser-session-events.ts";
import { onSessionCleared, onSessionRefreshed } from "../../api/session.ts";
import { createSignal, onCleanup } from "solid-js";
import { loadCommunityPage, type CommunityPageViewState } from "../communities/community-page/community-page.model.ts";
import { communityPageResponsePolicy } from "../communities/community-page/community-page-preflight.ts";
import { communityCanonicalOrigin, communityRequestOrigin } from "../communities/community-page/community-page-origin.ts";
import { publicPostIdHref, type PublicPostRouteState } from "../posts/public-post/public-post-route.model.ts";
import { publicPostResponsePolicy } from "../posts/public-post/public-post-preflight.ts";
import { publicPostCanonicalOrigin, publicPostUiLocale } from "../posts/public-post/public-post-route-loader.ts";
import { PublicPostRouteView } from "../posts/public-post/public-post-route-view.tsx";
import { resolveSongLeaderboardRoute, leaderboardReturnHref } from "./activity-leaderboard-navigation.ts";
import { ActivityLeaderboard } from "./activity-leaderboard.tsx";

function returnHref(fallback: string) {
  const href = getRequestEvent()?.request.url ?? (typeof location === "undefined" ? "https://pirate.invalid/" : location.href);
  return leaderboardReturnHref(new URL(href).searchParams.get("from"), fallback);
}
function commit(status: number, headers: Headers) {
  if (!getRequestEvent()) return;
  httpStatus(status); headers.forEach((value, key) => httpHeader(key, value));
}
export const communityLeaderboardQuery = query(async (segment: string) => {
  const state = await loadCommunityPage(createPublicCommunityRouteClient({ origin: communityRequestOrigin() }), segment, communityCanonicalOrigin());
  const policy = communityPageResponsePolicy(state); commit(policy.status, policy.headers);
  return state;
}, "community-streak-leaderboard-route");
export function CommunityLeaderboardRouteView(props: { readonly data: CommunityPageViewState | PromiseLike<CommunityPageViewState> }) {
  const state = createMemo(() => props.data, { deferStream: true });
  return <Loading fallback={<RouteLoading />}><Show when={state()}>{value => <Show when={value().kind === "success" ? value() : undefined} fallback={<RouteFailure />}>{success => {
    const community = () => { const current = success(); return current.kind === "success" ? current : undefined; };
    return <><Title>Leaderboard</Title><ActivityLeaderboard display="page" communityId={community()!.communityId} title={community()!.community.displayName} backHref={returnHref(`${community()!.canonicalPath}?tab=about`)} /></>;
  }}</Show>}</Show></Loading>;
}
export async function readSongLeaderboardRoute(kind: "id" | "slug", value: string, signal?: AbortSignal): Promise<PublicPostRouteState> {
  const state = await resolveSongLeaderboardRoute({ kind, value, canonicalOrigin: publicPostCanonicalOrigin(), locale: publicPostUiLocale(), client: createSessionApiClient({ origin: communityRequestOrigin(), fetchImpl: (input, init) => fetch(input, { ...init, ...(signal ? { signal } : {}) }) }) });
  if (state.kind === "redirect") {
    const location = state.location;
    if (getRequestEvent()) { httpStatus(308); httpHeader("location", location); httpHeader("cache-control", "no-store"); }
    else if (typeof window !== "undefined") window.location.replace(location);
    return { ...state, location };
  }
  const policy = publicPostResponsePolicy(state); commit(policy.status, policy.headers);
  return state;
}
export const songLeaderboardQuery = query((kind: "id" | "slug", value: string, _authority = captureSessionAuthority()) => readSongLeaderboardRoute(kind, value), "song-streak-leaderboard-route");
export function SongLeaderboardRouteView(props: { readonly kind: "id" | "slug"; readonly value: string; readonly data: PublicPostRouteState | PromiseLike<PublicPostRouteState> }) {
  const [revision, setRevision] = createSignal(0);
  onCleanup(onSessionRefreshed(() => setRevision(value => value + 1)));
  onCleanup(onSessionCleared(() => setRevision(value => value + 1)));
  const state = createMemo(() => revision() === 0 ? props.data : songLeaderboardQuery(props.kind, props.value, captureSessionAuthority()), { deferStream: true });
  return <Loading fallback={<RouteLoading />}><Show when={state()} keyed>{current => <Show when={current.kind === "content" && current.response.content.post.post_type === "song" ? current : undefined} fallback={current.kind === "content" ? <RouteFailure /> : <PublicPostRouteView state={current} />}>
    {content => { const post = () => content(); return <><Title>Leaderboard</Title><ActivityLeaderboard display="page" communityId={post()!.response.content.post.community} postId={post()!.response.post_id} title={(post()!.response.content.translation_state === "ready" ? post()!.response.content.translated_title : undefined) || post()!.response.content.post.song_title || post()!.response.content.post.title || "Song"} backHref={returnHref(post()!.canonicalPath ?? publicPostIdHref(post()!.response.post_id))} /></>; }}
  </Show>}</Show></Loading>;
}
function RouteLoading() { return <main class="p-6" aria-busy="true"><p role="status">Loading leaderboard…</p></main>; }
function RouteFailure() { return <main class="space-y-4 p-6"><h1 class="text-xl font-semibold">The leaderboard isn't showing</h1><a href="/communities">Back to communities</a></main>; }
