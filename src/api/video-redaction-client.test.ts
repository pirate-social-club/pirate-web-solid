import { describe, expect, test, vi } from "vitest";
import { ApiClientResponseValidationError, type PirateApiClient } from "@pirate/api-client";
import { createPublicApiClient, createSessionApiClient } from "./client.ts";
import { publicFeedStagingContractFixture } from "../features/posts/feed/public-feed-staging-contract.fixture.ts";
import { readSongAttribution } from "../features/posts/song-attribution/song-attribution.ts";
import { normalizePublicFeed } from "../features/posts/feed/public-feed-adapter.ts";
import { loadPublicPostById } from "../features/posts/public-post/public-post-route.model.ts";

// Explicit wire examples extend the owned sanitized feed fixture. No runtime
// schema introspection or decoder replacement participates in fixture creation.
const operations = ["get_feedHomePublic", "get_feedHome", "get_postsPostId", "get_publicCommunitiesCommunityRefFeed",
  "get_publicPersonasPersonaIdActivity", "get_publicPostsByIdPostIdCanonicalRoute", "get_publicPostsBySlug"] as const;
type Operation = typeof operations[number];
type FixtureAuthor = string | null | number | Readonly<Record<string, never>> | undefined;
const base = publicFeedStagingContractFixture.items[0]!.post!;
const summary = publicFeedStagingContractFixture.top_communities[0]!;
const locked = { kind: "age_locked", content_rating: "adult_18", next_action: { kind: "verify_minimum_age", minimum_age: 18 } } as const;
function video(kind: "original_audio" | "song_reference", author: FixtureAuthor) {
  return { track: "video", caption: "Published video", caption_dir: "ltr", caption_lang: "en",
    soundtrack: kind === "original_audio"
      ? { kind, original_sound_id: "sound-1", origin_video_post_id: "video-1", origin_author_persona_id: author }
      : { kind, render_mode: "canonical_replace", song_reference: { song_post_id: "song-1", song_title: "Projected song", song_author_persona_id: author } },
    playback: { status: "ready", provider: "stream", playback_ref: "opaque-playback-ref" },
    thumbnail: { status: "ready", artifact_ref: "opaque-poster-ref" },
    data_registration: "registered", capabilities: { can_post_with_song: false } };
}
function content(value: ReturnType<typeof video>) {
  return { ...base, canonical_path: null,
    post: { ...base.post, id: "video-1", post_type: "video", author_persona: null }, video: value };
}
function response(operation: Operation, value: ReturnType<typeof video>) {
  const envelope = content(value);
  switch (operation) {
    case "get_feedHomePublic": case "get_feedHome":
      return { items: [{ community: summary, post: envelope }, locked], top_communities: [summary], next_cursor: null };
    case "get_postsPostId": return envelope;
    case "get_publicCommunitiesCommunityRefFeed":
      return { community: { id: "fixture-community-1", object: "community_preview", display_name: "Fixture Community", membership_mode: "open",
        human_verification_lane: null, moderators: [], membership_gate_summaries: [], rules: [], created: 1787500000 }, items: [envelope, locked], next_cursor: null };
    case "get_publicPersonasPersonaIdActivity":
      return { object: "profile_activity_page", items: [{ kind: "post", activity_id: "activity-video-1", activity_at: "2026-10-16T12:00:00Z",
        community_id: "fixture-community-1", post_id: "video-1", href: "/post/video-1", content: envelope }], next_cursor: null };
    case "get_publicPostsByIdPostIdCanonicalRoute": case "get_publicPostsBySlug":
      return { kind: "content", post_id: "video-1", content: envelope, route: null };
  }
}
function read(client: PirateApiClient, operation: Operation) {
  switch (operation) {
    case "get_feedHomePublic": return client.get_feedHomePublic({ query: { locale: "en", sort: "new" } });
    case "get_feedHome": return client.get_feedHome({ query: { locale: "en", sort: "new" } });
    case "get_postsPostId": return client.get_postsPostId({ path: { postId: "video-1" } });
    case "get_publicCommunitiesCommunityRefFeed": return client.get_publicCommunitiesCommunityRefFeed({ path: { communityRef: "fixture-community" }, query: { surface: "threads", sort: "new" } });
    case "get_publicPersonasPersonaIdActivity": return client.get_publicPersonasPersonaIdActivity({ path: { personaId: "public-profile" }, query: { surface: "posts" } });
    case "get_publicPostsByIdPostIdCanonicalRoute": return client.get_publicPostsByIdPostIdCanonicalRoute({ path: { postId: "video-1" } });
    case "get_publicPostsBySlug": return client.get_publicPostsBySlug({ query: { slug: "literal-historical-video" } });
  }
}
const authenticated = (operation: Operation) => operation === "get_feedHome" || operation === "get_postsPostId";
function transport<T>(body: T, session = false) {
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json(body));
  const factory = session ? createSessionApiClient : createPublicApiClient;
  return { client: factory({ origin: "https://solid.test", fetchImpl }), fetchImpl };
}

describe.each(operations)("installed0.122 generated %s video contract", operation => {
  test.each((["original_audio", "song_reference"] as const).flatMap(kind => [null, "authorized-persona"].map(author => ({ kind, author }))))("decodes $kind author=$author without rewriting privacy", async ({ kind, author }) => {
    const body = response(operation, video(kind, author));
    const { client, fetchImpl } = transport(body, authenticated(operation));
    expect(await read(client, operation)).toEqual(body);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [input, init] = fetchImpl.mock.calls[0]!;
    expect(new URL(String(input)).origin).toBe("https://solid.test");
    expect(new URL(String(input)).pathname).toMatch(/^\/api\//u);
    expect(init?.method).toBe("GET");
    expect(init?.credentials).toBe(authenticated(operation) ? "same-origin" : "omit");
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
  });
  test.each((["original_audio", "song_reference"] as const).flatMap(kind => [42, {}, undefined].map(author => ({ kind, author }))))("refuses malformed/missing $kind author=$author", async ({ kind, author }) => {
    const { client } = transport(response(operation, video(kind, author)), authenticated(operation));
    await expect(read(client, operation)).rejects.toMatchObject({ _tag: "ApiClientResponseValidationError", operation, status: 200 });
  });
});

test.each(operations)("%s preserves its existing age projection", async operation => {
  if (operation === "get_publicPersonasPersonaIdActivity") {
    const { client } = transport({ object: "profile_activity_page", items: [locked], next_cursor: null });
    await expect(read(client, operation)).rejects.toBeInstanceOf(ApiClientResponseValidationError);
    return;
  }
  const body = operation === "get_postsPostId" ? locked
    : operation === "get_publicPostsByIdPostIdCanonicalRoute" || operation === "get_publicPostsBySlug" ? { kind: "age_locked", locked }
    : response(operation, video("original_audio", null));
  const { client } = transport(body, authenticated(operation));
  expect(await read(client, operation)).toEqual(body);
});
test.each(["get_postsPostId", "get_publicPostsByIdPostIdCanonicalRoute", "get_publicPostsBySlug"] as const)("%s refuses the other age envelope", async operation => {
  const { client } = transport(operation === "get_postsPostId" ? { kind: "age_locked", locked } : locked, authenticated(operation));
  await expect(read(client, operation)).rejects.toBeInstanceOf(ApiClientResponseValidationError);
});
test.each(["get_publicCommunitiesCommunityRefFeed", "get_publicPersonasPersonaIdActivity", "get_publicPostsByIdPostIdCanonicalRoute", "get_publicPostsBySlug"] as const)("%s also retains the optional-session reader boundary", async operation => {
  const body = response(operation, video("song_reference", null));
  const { client, fetchImpl } = transport(body, true);
  expect(await read(client, operation)).toEqual(body);
  expect(fetchImpl.mock.calls[0]?.[1]?.credentials).toBe("same-origin");
});
test("decoded redaction reaches feed and attribution consumers without restoring prior identity", async () => {
  let body = response("get_feedHomePublic", video("song_reference", "earlier-private-persona"));
  const client = createPublicApiClient({ origin: "https://solid.test", fetchImpl: async () => Response.json(body) });
  await client.get_feedHomePublic({});
  body = response("get_feedHomePublic", video("song_reference", null));
  const decoded = await client.get_feedHomePublic({});
  const first = decoded.items[0];
  if (!first || "kind" in first) throw new Error("Expected a current video item");
  expect(readSongAttribution(first.post.video)).toBeNull();
  const page = normalizePublicFeed(decoded);
  expect(page.items[0]).toMatchObject({ id: "video-1", songPostId: "song-1", authorPersonaId: null });
  expect(JSON.stringify(page)).not.toContain("earlier-private-persona");
});
test("authorized video detail retains route:null and no canonical/song activity metadata", async () => {
  const { client } = transport(response("get_publicPostsByIdPostIdCanonicalRoute", video("original_audio", null)));
  const state = await loadPublicPostById({ client, postId: "video-1", activity: "detail", canonicalOrigin: "https://solid.test", requestPath: "/post/video-1" });
  expect(state).toMatchObject({ kind: "content", canonicalPath: null, canonicalUrl: null, response: { route: null } });
  expect(state).not.toHaveProperty("activityPaths");
});
