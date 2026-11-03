import type { GetPublicPostsBySlugResponse } from "@pirate/api-client";
import { expect, test, vi } from "vitest";
import { leaderboardLibraryHref, leaderboardRedirectHref, leaderboardReturnHref, resolveSongLeaderboardRoute } from "./activity-leaderboard-navigation.ts";
function response(): GetPublicPostsBySlugResponse {
  // SAFETY: the canonical projector reads this subset; generated transport validation has its own tests.
  return { kind: "content", post_id: "song", content: { post: { id: "song", post_type: "song" } }, route: { canonical_path: "/posts/title", activity_paths: { study: "/posts/title/study", karaoke: "/posts/title/karaoke", karaoke_leaderboard: "/posts/title/karaoke/leaderboard" } } } as GetPublicPostsBySlugResponse;
}
function client() { return { get_publicPostsBySlug: vi.fn(async () => response()), get_publicPostsByIdPostIdCanonicalRoute: vi.fn(async () => response()) }; }
test("the ID entry follows the server canonical slug and retains the leaderboard destination", async () => {
  const api = client();
  expect(await resolveSongLeaderboardRoute({ kind: "id", value: "song", client: api, canonicalOrigin: "https://pirate.sc" })).toEqual({ kind: "redirect", status: 308, location: "https://pirate.sc/posts/title/leaderboard" });
  expect(api.get_publicPostsByIdPostIdCanonicalRoute).toHaveBeenCalledOnce(); expect(api.get_publicPostsBySlug).not.toHaveBeenCalled();
});
test("direct canonical song load retains the validated post and scope", async () => {
  expect(await resolveSongLeaderboardRoute({ kind: "slug", value: "title", client: client(), canonicalOrigin: "https://pirate.sc" })).toMatchObject({ kind: "content", canonicalPath: "/posts/title", response: { post_id: "song" } });
});
test("invalid slugs stop before reading and a mismatched post cannot become a board", async () => {
  const api = client();
  expect(await resolveSongLeaderboardRoute({ kind: "slug", value: "%2F", client: api, canonicalOrigin: "https://pirate.sc" })).toEqual({ kind: "invalid", status: 400 });
  expect(api.get_publicPostsBySlug).not.toHaveBeenCalled();
  expect(await resolveSongLeaderboardRoute({ kind: "id", value: "other-song", client: api, canonicalOrigin: "https://pirate.sc" })).toEqual({ kind: "unavailable", status: 502 });
});
test.each(["//example.invalid", "/\\example.invalid", "https://example.invalid", "javascript:alert(1)", "/\nheader"])("rejects an unsafe return destination %s", value => {
  expect(leaderboardReturnHref(value, "/c/community?tab=about")).toBe("/c/community?tab=about");
});
test("return preserves the About tab and a song library destination", () => {
  expect(leaderboardReturnHref("/c/community?tab=about", "/")).toBe("/c/community?tab=about");
  expect(leaderboardReturnHref("/songs", "/")).toBe("/songs");
});

test("malformed URL authority in a bounded return falls back without throwing", () => {
  expect(leaderboardReturnHref("/" + String.fromCharCode(92) + "%", "/songs")).toBe("/songs");
});
test("canonical ID redirect keeps a safe library return and drops an unsafe return", async () => {
  expect(await resolveSongLeaderboardRoute({ kind: "id", value: "song", client: client(), canonicalOrigin: "https://pirate.sc", returnTo: "/songs" })).toMatchObject({ kind: "redirect", location: "https://pirate.sc/posts/title/leaderboard?from=%2Fsongs" });
  expect(leaderboardRedirectHref("https://pirate.sc/posts/title/leaderboard", "//example.invalid")).toBe("https://pirate.sc/posts/title/leaderboard");
});

test("the song sheet records the song-library return explicitly", () => {
  expect(leaderboardLibraryHref("/posts/title/leaderboard")).toBe("/posts/title/leaderboard?from=%2Fsongs");
});
