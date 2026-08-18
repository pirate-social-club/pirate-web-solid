import { describe, expect, test } from "bun:test";
import type { KaraokeApiClient } from "./karaoke-api";
import { isKaraokeAuthError, loadKaraokeLeaderboard } from "./karaoke-route-model";

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
