import { createRouter } from "@solidjs/router";
import { render } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { clearSession, refreshSession } from "../../api/session.ts";
import * as session from "../../api/session.ts";
import type { PublicPostContentResponse, PublicPostRouteState } from "../posts/public-post/public-post-route.model.ts";
import { SongLeaderboardRouteView } from "./activity-leaderboard-route.tsx";
const Router = createRouter({ routes: [{ path: "/posts/:slug/leaderboard" }] });
const stops: (() => void)[] = [];
afterEach(() => { stops.splice(0).forEach(stop => stop()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const wire = { kind: "content", post_id: "song", content: { post: { id: "song", object: "post", community: "community", authorship_mode: "human_direct", identity_mode: "public", post_type: "song", status: "published", visibility: "public", analysis_state: "allow", content_safety_state: "safe", age_gate_policy: "none", created: 1756752000, title: "Former account title", body: "Public song." }, thread_snapshot: null, upvote_count: 0, downvote_count: 0, like_count: 0, viewer_vote: null, viewer_reaction_kinds: [], resolved_locale: "en", translation_state: "same_language", machine_translated: false, source_hash: null, translated_title: null, translated_body: null }, route: { canonical_path: "/posts/title", activity_paths: { study: "/posts/title/study", karaoke: "/posts/title/karaoke", karaoke_leaderboard: "/posts/title/karaoke/leaderboard" } } };
test("session changes drop guarded metadata immediately and a late former read cannot restore it", async () => {
  history.replaceState(null, "", "/posts/title/leaderboard");
  vi.spyOn(session, "resolveSession").mockResolvedValue("anonymous");
  const pending: ((response: Response) => void)[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(input instanceof Request ? input.url : String(input), location.origin).pathname;
    if (path === "/api/public/posts/by-slug") return new Promise<Response>(resolve => pending.push(resolve));
    return Response.json({ object: "activity_streak_leaderboard", scope: { kind: "song", community_id: "community", post_id: "song" }, day_semantics: "account_pinned_iana_timezone_v1", entries: [], viewer_standing: null });
  }));
  // SAFETY: the fixture supplies the rendered fields; the generated transport validates the later wire response.
  const response = wire as PublicPostContentResponse;
  const initial: PublicPostRouteState = { kind: "content", status: 200, activity: "detail", response, canonicalPath: "/posts/title", canonicalUrl: `${location.origin}/posts/title` };
  const host = document.createElement("div"); document.body.appendChild(host);
  createRoot(stop => { render(() => <Router>{() => <SongLeaderboardRouteView kind="slug" value="title" data={initial} />}</Router>, host); stops.push(() => { stop(); host.remove(); }); });
  await vi.waitFor(() => expect(host.textContent).toContain("Former account title"));
  clearSession(); await vi.waitFor(() => expect(pending).toHaveLength(1));
  expect(host.textContent).not.toContain("Former account title");
  refreshSession(); await vi.waitFor(() => expect(pending).toHaveLength(2));
  pending[1](Response.json({ error: { code: "not_found", message: "Not found", retryable: false } }, { status: 404 }));
  await vi.waitFor(() => expect(host.textContent).toContain("This post is not available."));
  pending[0](Response.json(wire));
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(host.textContent).not.toContain("Former account title"); expect(host.textContent).toContain("This post is not available.");
});
