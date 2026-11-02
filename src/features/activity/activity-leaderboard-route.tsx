import { Spinner } from "../../design-system.ts";
import { query } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { getRequestEvent, httpHeader, httpStatus, isServer } from "@solidjs/web";
import { Loading, Show, createMemo, createEffect } from "solid-js";
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
import type { ActivityLeaderboardPreflight } from "./activity-leaderboard-preflight.ts";
import { decodePublicPostSlug } from "../posts/public-post/public-post-route.model.ts";
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
  // SAFETY: entry-server alone supplies this typed request-local preflight.
  const settled = getRequestEvent()?.locals.activityLeaderboardPreflight as ActivityLeaderboardPreflight | undefined;
  if (settled?.kind === "community" && settled.value === segment) return settled.state;
  if (isServer) return { kind: "unavailable", status: 502 } as const;
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
  // SAFETY: entry-server alone supplies this typed request-local preflight.
  const settled = getRequestEvent()?.locals.activityLeaderboardPreflight as ActivityLeaderboardPreflight | undefined;
  if (settled?.kind === "song" && settled.identity === kind && (kind === "id" ? settled.value === value : decodePublicPostSlug(settled.value)?.logical === decodePublicPostSlug(value)?.logical)) return settled.state;
  if (isServer) return { kind: "unavailable", status: 502 };
  const state = await resolveSongLeaderboardRoute({ kind, value, returnTo: new URL(location.href).searchParams.get("from"), canonicalOrigin: publicPostCanonicalOrigin(), locale: publicPostUiLocale(), client: createSessionApiClient({ origin: communityRequestOrigin(), fetchImpl: (input, init) => fetch(input, { ...init, ...(signal ? { signal } : {}) }) }) });
  if (state.kind === "redirect") {
    const location = state.location;
    if (getRequestEvent()) { httpStatus(308); httpHeader("location", location); httpHeader("cache-control", "no-store"); }
    return { ...state, location };
  }
  const policy = publicPostResponsePolicy(state); commit(policy.status, policy.headers);
  return state;
}
export const songLeaderboardQuery = query((kind: "id" | "slug", value: string, _authority = captureSessionAuthority(), _revision = 0) => readSongLeaderboardRoute(kind, value), "song-streak-leaderboard-route");
export function SongLeaderboardRouteView(props: { readonly kind: "id" | "slug"; readonly value: string; readonly data: PublicPostRouteState | PromiseLike<PublicPostRouteState> }) {
  const [revision, setRevision] = createSignal(0);
  // The scope effect starts metadata revalidation and clears the former account immediately.
  const [refreshing, setRefreshing] = createSignal(false, { ownedWrite: true });
  const [refreshed, setRefreshed] = createSignal<{ kind: "id" | "slug"; value: string; revision: number; state: PublicPostRouteState }>();
  let generation = 0;
  onCleanup(() => { generation++; });
  const invalidate = () => { setRefreshing(true); setRevision(value => value + 1); };
  onCleanup(onSessionRefreshed(invalidate));
  onCleanup(onSessionCleared(invalidate));
  createEffect(() => [props.kind, props.value, revision()] as const, ([kind, value, currentRevision]) => {
    const request = ++generation;
    if (currentRevision === 0) { setRefreshing(false); return; }
    setRefreshing(true);
    const current = () => request === generation && props.kind === kind && props.value === value && revision() === currentRevision;
    void Promise.resolve(songLeaderboardQuery(kind, value, captureSessionAuthority(), currentRevision)).then(state => {
      if (current()) setRefreshed({ kind, value, revision: currentRevision, state });
    }, () => { if (current()) setRefreshed({ kind, value, revision: currentRevision, state: { kind: "unavailable", status: 502 } }); })
      .finally(() => { if (current()) setRefreshing(false); });
  });
  const state = createMemo(() => {
    if (revision() === 0) return props.data;
    const value = refreshed();
    return value?.kind === props.kind && value.value === props.value && value.revision === revision() ? value.state : { kind: "unavailable", status: 502 } as const;
  }, { deferStream: true });
  return <Show when={!refreshing()} fallback={<RouteLoading />}><Loading fallback={<RouteLoading />}><Show when={state()} keyed>{current => <Show when={current.kind === "content" && current.response.content.post.post_type === "song" ? current : undefined} fallback={current.kind === "redirect" ? <RouteRedirect href={current.location} /> : current.kind === "content" ? <RouteFailure /> : <PublicPostRouteView state={current} reload={(_activity, signal) => readSongLeaderboardRoute(props.kind, props.value, signal)} />}>
    {content => { const post = () => content(); return <><Title>Leaderboard</Title><ActivityLeaderboard display="page" communityId={post()!.response.content.post.community} postId={post()!.response.post_id} title={(post()!.response.content.translation_state === "ready" ? post()!.response.content.translated_title : undefined) || post()!.response.content.post.song_title || post()!.response.content.post.title || "Song"} backHref={returnHref(post()!.canonicalPath ?? publicPostIdHref(post()!.response.post_id))} /></>; }}
  </Show>}</Show></Loading></Show>;
}
function RouteLoading() { return <main class="grid min-h-64 place-items-center p-6" aria-busy="true"><Spinner size="lg" label="Loading leaderboard" /></main>; }
function RouteFailure() { return <main class="space-y-4 p-6"><h1 class="text-xl font-semibold">The leaderboard isn't showing</h1><a href="/communities">Back to communities</a></main>; }

function RouteRedirect(props: { readonly href: string }) {
  createEffect(() => props.href, href => { if (!isServer) location.replace(href); });
  return <RouteLoading />;
}
