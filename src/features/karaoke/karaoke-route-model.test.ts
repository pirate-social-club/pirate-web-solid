import { describe, expect, test } from "bun:test";
import type { ApiSongKaraokePayload, KaraokeApiClient } from "./karaoke-api";
import { isKaraokeAuthError, loadKaraokeLeaderboard, renewKaraokePlayback } from "./karaoke-route-model";

const client = (overrides: Partial<KaraokeApiClient> = {}): KaraokeApiClient => ({
  createSession: async () => { throw new Error("unused"); },
  getAttempt: async () => { throw new Error("unused"); },
  getLeaderboard: async () => ({ object: "karaoke_song_leaderboard", post_id: "pst-1", community_id: "com-1", scope: "all_time", karaoke_revision_id: "rev-1", scoring_version: 1, scoring_provider: "openai", scoring_model: "model", total_ranked: 0, entries: [], viewer_rank: null, viewer_top_percent: null, viewer_best_score: null, viewer_best_reached_at: null, viewer_eligible_attempt_count: 0 }),
  getPayload: async () => ({ id: "bundle-1", object: "song_karaoke_payload", community: "com-1", post: "pst-1", title: "Song", karaoke_lines: [] }),
  ...overrides,
});

describe("karaoke route model", () => {
  test("loads the public payload before the authenticated leaderboard", async () => {
    const calls: string[] = [];
    const result = await loadKaraokeLeaderboard(client({
      getPayload: async () => { calls.push("payload"); return client().getPayload("pst-1"); },
      getLeaderboard: async () => { calls.push("leaderboard"); return client().getLeaderboard({ communityId: "com-1", postId: "pst-1" }); },
    }), "pst-1");
    expect(calls).toEqual(["payload", "leaderboard"]);
    expect(result.payload.community).toBe("com-1");
  });

  test("identifies the signed-out leaderboard state", () => {
    expect(isKaraokeAuthError({ status: 401 })).toBe(true);
    expect(isKaraokeAuthError({ status: 403 })).toBe(false);
  });
});

const admittedPayload: ApiSongKaraokePayload = {
  id: "revision-1", post: "pst-1", community: "com-1", object: "song_karaoke_payload",
  playback_access: {
    kind: "instrumental", ref: "media://instrumental/1",
    grant: { url: "https://media.test/first", expiresAtMs: 2000, renewAtMs: 1000 },
  },
};

describe("karaoke access renewal", () => {
  test("accepts a renewed URL for the same recording without creating a scored session", async () => {
    let starts = 0;
    const next = { ...admittedPayload, playback_access: {
      ...admittedPayload.playback_access!, grant: { url: "https://media.test/renewed", expiresAtMs: 4000, renewAtMs: 3000 },
    } };
    const api = client({
      getPayload: async () => next,
      createSession: async () => { starts += 1; throw new Error("must not start"); },
    });
    expect(await renewKaraokePlayback(api, admittedPayload, new AbortController().signal)).toEqual(next.playback_access.grant);
    expect(starts).toBe(0);
  });

  test.each([
    { id: "revision-2" }, { post: "pst-2" }, { community: "com-2" },
    { playback_access: { ...admittedPayload.playback_access!, kind: "full_mix" as const } },
    { playback_access: { ...admittedPayload.playback_access!, ref: "media://instrumental/2" } },
    { playback_access: undefined },
  ])("refuses a changed admitted binding: %j", async patch => {
    const api = client({ getPayload: async () => ({ ...admittedPayload, ...patch }) });
    await expect(renewKaraokePlayback(api, admittedPayload, new AbortController().signal)).rejects.toThrow("The song changed");
  });

  test("an interrupted renewal cannot revive the route", async () => {
    const controller = new AbortController();
    const api = client({ getPayload: async () => { controller.abort(); return admittedPayload; } });
    await expect(renewKaraokePlayback(api, admittedPayload, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
