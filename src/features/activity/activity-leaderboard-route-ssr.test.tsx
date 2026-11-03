import { createRouter } from "@solidjs/router";
import { createRequestEvent, createSSRResponse } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "../../entry-server.tsx";
import { CommunityLeaderboardRouteView, SongLeaderboardRouteView, communityLeaderboardQuery, songLeaderboardQuery } from "./activity-leaderboard-route.tsx";

const Router = createRouter({ routes: ["/c/:path_segment/leaderboard", "/posts/:slug/leaderboard", "/post/:postId/leaderboard"].map(path => ({ path })) });
const apiOrigin = "https://api-next.example";
const appOrigin = "https://solid.example";
const communityId = "community_123e4567-e89b-42d3-a456-426614174000";
const preview = { id: communityId, object: "community_preview", display_name: "Fixture community", membership_mode: "open", human_verification_lane: null, moderators: [], membership_gate_summaries: [], rules: [], created: 1700000000 };
const song = { kind: "content", post_id: "song", content: {
  post: { id: "song", object: "post", community: communityId, authorship_mode: "human_direct", identity_mode: "public", post_type: "song", status: "published", visibility: "public", analysis_state: "allow", content_safety_state: "safe", age_gate_policy: "none", created: 1756752000, title: "Fixture song", body: "Public song." },
  thread_snapshot: null, upvote_count: 0, downvote_count: 0, like_count: 0, viewer_vote: null, viewer_reaction_kinds: [], resolved_locale: "en", translation_state: "same_language", machine_translated: false, source_hash: null, translated_title: null, translated_body: null,
}, route: { canonical_path: "/posts/title", activity_paths: { study: "/posts/title/study", karaoke: "/posts/title/karaoke", karaoke_leaderboard: "/posts/title/karaoke/leaderboard" } } };
afterEach(() => vi.restoreAllMocks());
async function serve(path: string, Application: () => ReturnType<typeof CommunityLeaderboardRouteView>, method = "GET", configuredOrigin: string | undefined = apiOrigin) {
  const request = new Request(`${appOrigin}${path}`, { method, headers: { cookie: "__Host-pirate_session=session-value; __Host-pirate_csrf=discard; extra=discard", authorization: "Bearer discard", "x-csrf-token": "discard" } });
  const event = createRequestEvent(request);
  const RoutedApplication = () => <Router>{() => <Application />}</Router>;
  return provideRequestEvent(event, async () => {
    const stream = await render(request, { API_NEXT_ORIGIN: configuredOrigin, PUBLIC_APP_CANONICAL_ORIGIN: appOrigin }, { Application: RoutedApplication });
    return stream instanceof Response ? stream : createSSRResponse(stream, event);
  });
}
function transport(ageLocked = false) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    expect(url.origin).toBe(apiOrigin); expect(url.pathname).not.toMatch(/^\/api\//u); expect(init?.credentials).toBe("omit");
    const headers = new Headers(init?.headers);
    expect(headers.has("authorization")).toBe(false); expect(headers.has("x-csrf-token")).toBe(false);
    if (url.pathname === `/communities/${communityId}/preview`) { expect(headers.has("cookie")).toBe(false); return Response.json(preview); }
    if (url.pathname === `/c/${communityId}`) { expect(headers.has("cookie")).toBe(false); return Response.json({ authority_version: "optional_route_v2", community_id: communityId, href: `/c/${communityId}`, canonical_route: null, persona_role_presentation: { role: "owner", persona: { object: "persona", persona_id: "owner-profile", display_name: "Community owner", avatar_ref: null, primary_public_handle: null } } }); }
    if (url.pathname === "/public/posts/by-slug" || url.pathname === "/public/posts/by-id/song/canonical-route") {
      expect(headers.get("cookie")).toBe("__Host-pirate_session=session-value");
      return Response.json(ageLocked ? { kind: "age_locked", locked: { kind: "age_locked", content_rating: "adult_18", next_action: { kind: "verify_minimum_age", minimum_age: 18 } } } : song);
    }
    throw new Error(`Unexpected SSR request: ${url.pathname}`);
  });
}
test("community leaderboard SSR adopts direct public metadata without feed, session or progress self-fetch", async () => {
  const network = transport();
  const response = await serve(`/c/${communityId}/leaderboard`, () => <CommunityLeaderboardRouteView data={communityLeaderboardQuery(communityId)} />);
  const html = await response.text();
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
  expect(html).toContain("Fixture community"); expect(html).toContain("Loading leaderboard");
  expect(network).toHaveBeenCalledTimes(2);
});
test("canonical song leaderboard SSR reuses direct optional-viewer policy and serialized metadata", async () => {
  const network = transport();
  const response = await serve("/posts/title/leaderboard", () => <SongLeaderboardRouteView kind="slug" value="title" data={songLeaderboardQuery("slug", "title")} />);
  const html = await response.text();
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("vary")).toContain("Cookie");
  expect(html).toContain("Fixture song"); expect(html).toContain("Loading leaderboard"); expect(network).toHaveBeenCalledOnce();
});
test.each(["GET", "HEAD"])("ID leaderboard %s resolves the canonical destination and retains the safe return", async method => {
  const network = transport();
  const response = await serve("/post/song/leaderboard?from=%2Fsongs", () => <p>Must not render before redirect</p>, method);
  expect(response.status).toBe(308); expect(response.headers.get("location")).toBe(`${appOrigin}/posts/title/leaderboard?from=%2Fsongs`); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(network).toHaveBeenCalledOnce();
});
test("age-locked song metadata never becomes a public board or a private progress read", async () => {
  const network = transport(true);
  const response = await serve("/posts/title/leaderboard", () => <SongLeaderboardRouteView kind="slug" value="title" data={songLeaderboardQuery("slug", "title")} />);
  const html = await response.text(); expect(html).not.toContain("Fixture song"); expect(html).not.toContain("data-leaderboard-page"); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(network).toHaveBeenCalledOnce();
});
test("write methods refuse before any source lookup", async () => {
  const network = transport(); const response = await serve("/posts/title/leaderboard", () => <p>Must not render</p>, "POST");
  expect(response.status).toBe(405); expect(network).not.toHaveBeenCalled();
});
test("missing configured API origin fails closed rather than self-proxying", async () => {
  const network = transport();
  const response = await serve(`/c/${communityId}/leaderboard`, () => <CommunityLeaderboardRouteView data={communityLeaderboardQuery(communityId)} />, "GET", "");
  await response.text(); expect(response.status).toBe(502); expect(network).not.toHaveBeenCalled();
});
