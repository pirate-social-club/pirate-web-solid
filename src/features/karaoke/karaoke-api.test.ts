import { describe, expect, test } from "bun:test";
import { createKaraokeApiClient } from "./karaoke-api";

const payload = {
  id: "bundle-1",
  object: "song_karaoke_payload" as const,
  community: "com_1",
  post: "pst_1",
  title: "Song",
  karaoke_lines: [],
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
}

describe("createKaraokeApiClient", () => {
  test("loads the public post payload without requiring auth", async () => {
    const requests: Request[] = [];
    const client = createKaraokeApiClient({
      apiOrigin: "https://api.test/",
      fetchImpl: async (input, init) => {
        requests.push(new Request(input, init));
        return response(payload);
      },
    });

    await expect(client.getPayload("pst/1")).resolves.toEqual(payload);
    expect(requests[0]?.url).toBe("https://api.test/public-posts/pst%2F1/karaoke");
    expect(requests[0]?.credentials).toBe("include");
  });

  test("posts an idempotent session request and reads leaderboard through the contract paths", async () => {
    const requests: Request[] = [];
    const client = createKaraokeApiClient({
      apiOrigin: "https://api.test",
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.method === "POST") {
          return response({ id: "session-1", object: "karaoke_session", attempt: "attempt-1", protocol_version: 1, websocket_url: "wss://ws.test/session-1", token_expires_at: 2000, session_expires_at: 3000, scoring_policy: { kind: "disabled" } }, 201);
        }
        if (request.url.includes("/attempts/")) return response({ object: "karaoke_attempt", id: "attempt-1" });
        return response({ object: "karaoke_song_leaderboard", post_id: "pst_1", community_id: "com_1", scope: "all_time", karaoke_revision_id: "rev-1", scoring_version: 1, scoring_provider: "openai", scoring_model: "model", total_ranked: 0, entries: [], viewer_rank: null, viewer_top_percent: null, viewer_best_score: null, viewer_best_reached_at: null, viewer_eligible_attempt_count: 0 });
      },
    });

    await client.createSession({ communityId: "com_1", postId: "pst_1", idempotencyKey: "key-1" });
    await client.getLeaderboard({ communityId: "com_1", postId: "pst_1", limit: 10 });
    await client.getAttempt({ communityId: "com_1", attemptId: "attempt-1" });
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.headers.get("Idempotency-Key")).toBe("key-1");
    expect(requests[0]?.url).toBe("https://api.test/communities/com_1/posts/pst_1/karaoke/sessions");
    expect(requests[1]?.url).toBe("https://api.test/communities/com_1/posts/pst_1/karaoke/leaderboard?limit=10");
    expect(requests[2]?.url).toBe("https://api.test/communities/com_1/karaoke/attempts/attempt-1");
  });

  test("preserves auth errors for the mic gate", async () => {
    const client = createKaraokeApiClient({
      apiOrigin: "https://api.test",
      fetchImpl: async () => response({ code: "auth_error", message: "Sign in required" }, 401),
    });
    await expect(client.getLeaderboard({ communityId: "com_1", postId: "pst_1" })).rejects.toMatchObject({ code: "auth_error", status: 401 });
  });
});
