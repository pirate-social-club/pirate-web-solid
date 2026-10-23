import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { GetPostsPostIdResponse } from "@pirate/api-client";
import { establishSessionAuthority, forgetSessionAuthority, replaceSessionAuthority } from "../../api/browser-session-events";
import { createSessionApiClient } from "../../api/client";
import { createDanceReferenceApi } from "./dance-reference-api";
import { danceReferenceCommand as body, danceReferencePersonas, danceReferenceSong, danceReferenceStatus, danceReferenceTarget as target, danceReferenceUser, danceReferenceVideo } from "./dance-reference.fixtures";

const scope = target.scope, signal = () => new AbortController().signal;
function harness() {
  let csrf: string | undefined = "reference-csrf", user = danceReferenceUser, personas = danceReferencePersonas;
  let video: GetPostsPostIdResponse = danceReferenceVideo, song: GetPostsPostIdResponse = danceReferenceSong;
  let response = danceReferenceStatus;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path === "/api/users/me") return Response.json(user);
    if (path === "/api/personas") return Response.json(personas);
    if (path === "/api/posts/video-post") return Response.json(video);
    if (path === "/api/posts/song-post") return Response.json(song);
    if (path.includes("/dance/moderated-references")) return Response.json(response);
    throw new Error(`Unexpected fixture request: ${init?.method} ${path}`);
  });
  const client = createSessionApiClient({ origin: "https://solid.test", fetchImpl });
  return { client, api: createDanceReferenceApi(client, () => csrf), fetchImpl,
    setUser: (v: typeof user) => { user = v; }, setPersonas: (v: typeof personas) => { personas = v; },
    setVideo: (v: GetPostsPostIdResponse) => { video = v; }, setSong: (v: GetPostsPostIdResponse) => { song = v; },
    setResponse: (v: typeof response) => { response = v; }, noCsrf: () => { csrf = undefined; } };
}
beforeEach(establishSessionAuthority);
afterEach(() => { forgetSessionAuthority(); vi.restoreAllMocks(); });
test("genuine133 decoders resolve the owned Community2 video back to its Community1 song", async () => {
  const h = harness(); expect(await h.api.target(scope.accountId, scope.referencePostId, signal())).toEqual(target);
  expect(h.fetchImpl.mock.calls.map(([input]) => new URL(String(input)).pathname)).toEqual([
    "/api/users/me", "/api/posts/video-post", "/api/personas", "/api/posts/song-post", "/api/users/me",
  ]);
  for (const [, init] of h.fetchImpl.mock.calls) { expect(init?.method).toBe("GET"); expect(init?.credentials).toBe("same-origin"); expect(new Headers(init?.headers).has("authorization")).toBe(false); }
});
test("only an active owned video-community persona authorizes authoring", async () => {
  const h = harness(); h.setPersonas({ personas: [] });
  await expect(h.api.target(scope.accountId, scope.referencePostId, signal())).rejects.toThrow("not_owned");
  expect(h.fetchImpl.mock.calls.some(([input]) => String(input).endsWith("/posts/song-post"))).toBe(false);
});
test("a mismatched video ID is refused before its song is followed", async () => {
  const h = harness(); h.setVideo({ ...danceReferenceVideo, post: { ...danceReferenceVideo.post, id: "another-video" } });
  await expect(h.api.target(scope.accountId, scope.referencePostId, signal())).rejects.toThrow("video_unavailable");
});
test("original-audio videos are never new Dance reference supply", async () => {
  const h = harness(); h.setVideo({ ...danceReferenceVideo, video: { ...danceReferenceVideo.video!, soundtrack: { kind: "original_audio", original_sound_id: "sound", origin_video_post_id: "origin", origin_author_persona_id: null } } });
  await expect(h.api.target(scope.accountId, scope.referencePostId, signal())).rejects.toThrow("video_unavailable");
});
test("age-locked songs do not become authoring targets", async () => {
  const h = harness(); h.setSong({ kind: "age_locked", content_rating: "adult_18", next_action: { kind: "verify_minimum_age", minimum_age: 18 } });
  await expect(h.api.target(scope.accountId, scope.referencePostId, signal())).rejects.toThrow("song_unavailable");
});
test("a pending playable delivery is represented without granting Create", async () => {
  const h = harness(); h.setVideo({ ...danceReferenceVideo, video: { ...danceReferenceVideo.video!, playback: { status: "pending" } } });
  expect((await h.api.target(scope.accountId, scope.referencePostId, signal())).playable).toBe(false);
});
test("creation freezes exact original body and song-community path through same-origin CSRF", async () => {
  const h = harness(); const abort = signal(); expect(await h.api.create(scope, body, abort)).toEqual(danceReferenceStatus);
  const [input, init] = h.fetchImpl.mock.calls.find(([, options]) => options?.method === "POST")!;
  expect(new URL(String(input)).pathname).toBe("/api/communities/song-community/posts/song-post/dance/moderated-references");
  expect(JSON.parse(String(init?.body))).toEqual(body); expect(init?.signal).toBe(abort); expect(init?.credentials).toBe("same-origin");
  expect(new Headers(init?.headers).get("x-csrf-token")).toBe("reference-csrf"); expect(new Headers(init?.headers).has("authorization")).toBe(false);
  expect(h.fetchImpl.mock.calls).toHaveLength(3);
});
test("a missing CSRF token or account replacement prevents a POST", async () => {
  const h = harness(); h.noCsrf(); await expect(h.api.create(scope, body, signal())).rejects.toThrow("csrf_unavailable");
  expect(h.fetchImpl.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  const changed = harness(); changed.setUser({ ...danceReferenceUser, id: "another-account" });
  await expect(changed.api.create(scope, body, signal())).rejects.toThrow("account_changed");
  expect(changed.fetchImpl.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
});
test("a cross-community body mismatch cannot dispatch", async () => {
  const h = harness(); await expect(h.api.create(scope, { ...body, community_id: scope.referenceCommunityId }, signal())).rejects.toThrow("target_changed");
  expect(h.fetchImpl).not.toHaveBeenCalled();
});
test("GET status rejects another choreography or reference; it never follows receipt hrefs", async () => {
  const h = harness(); h.setResponse({ ...danceReferenceStatus, choreography_id: "foreign" });
  await expect(h.api.status(scope, "choreography", signal())).rejects.toThrow("response_changed");
  h.setResponse({ ...danceReferenceStatus, reference_post_id: "foreign-video" });
  await expect(h.api.status(scope, "choreography", signal())).rejects.toThrow("response_changed");
  expect(h.fetchImpl.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
});
test("a same-account session epoch change fences an otherwise valid response", async () => {
  const h = harness(); const create = vi.spyOn(h.client, "post_communitiesCommunityIdPostsPostIdDanceModeratedReferences");
  create.mockImplementationOnce(async () => { replaceSessionAuthority(); return danceReferenceStatus; });
  await expect(h.api.create(scope, body, signal())).rejects.toThrow("session_changed"); expect(create).toHaveBeenCalledOnce();
});
