import { describe, expect, test } from "vitest";
import {
  createKaraokeApiClient,
  KaraokeAvailabilityError,
} from "./karaoke-api";

const postDetail = {
  downvote_count: 0,
  like_count: 0,
  machine_translated: false,
  post: {
    age_gate_policy: "none",
    analysis_state: "allow",
    authorship_mode: "human_direct",
    community: "com_1",
    content_safety_state: "safe",
    created: 1,
    id: "pst_1",
    identity_mode: "public",
    object: "post",
    post_type: "song",
    status: "published",
    visibility: "public",
  },
  resolved_locale: "en",
  source_hash: null,
  thread_snapshot: null,
  translation_state: "same_language",
  upvote_count: 0,
  viewer_reaction_kinds: [],
  viewer_vote: null,
};

const readyPayload = {
  community_id: "com_1",
  karaoke_lines: [{
    end_ms: 2_000,
    id: "line-1",
    index: 0,
    kind: "lyric" as const,
    start_ms: 1_000,
    text: "Sing it",
    words: [{ end_ms: 1_400, start_ms: 1_000, text: "Sing" }],
  }],
  karaoke_revision_id: "revision-1",
  object: "song_karaoke_payload",
  playback_audio: { kind: "full_mix", ref: "https://media.test/full-mix.mp3" },
  playback_kind: "full_mix",
  post_id: "pst_1",
  state: "ready",
  title: "Song",
};

const session = {
  attempt: "attempt-1",
  id: "session-1",
  object: "karaoke_session",
  persona_id: "persona-1",
  protocol_version: 1,
  scoring_policy: {
    kind: "enabled",
    model: "scribe_v2_realtime",
    platform_retention: "private_learning",
    provider: "elevenlabs",
    provider_retention: "stored",
    voice_coach_enabled: false,
  },
  session_expires_at: 3_000,
  token_expires_at: 2_000,
  websocket_url: "wss://ws.test/session-1",
};

const leaderboard = {
  community_id: "com_1",
  entries: [],
  karaoke_revision_id: "revision-1",
  object: "karaoke_song_leaderboard",
  period_end: null,
  period_start: null,
  post_id: "pst_1",
  scope: "all_time",
  scoring_model: "model",
  scoring_provider: "elevenlabs",
  scoring_version: 1,
  total_ranked: 0,
  viewer_best_reached_at: null,
  viewer_best_score: null,
  viewer_eligible_attempt_count: 0,
  viewer_rank: null,
  viewer_top_percent: null,
};

const attempt = {
  activity_date: "2026-08-30",
  attempt_id: "attempt-1",
  community_id: "com_1",
  completed_at: "2026-08-30T10:00:00Z",
  completion_reason: "completed",
  created_at: "2026-08-30T09:59:00Z",
  final_score: 90,
  id: "attempt-1",
  karaoke_revision_id: "revision-1",
  line_count: 1,
  low_confidence_line_count: 0,
  lyrics_score: 92,
  no_recognition_line_count: 0,
  object: "karaoke_attempt",
  persona_id: "persona-1",
  post_id: "pst_1",
  rank_eligible: true,
  recording_state: "stored",
  scored_line_count: 1,
  scoring_model: "model",
  scoring_provider: "elevenlabs",
  scoring_version: 1,
  session_id: "session-1",
  timing_score: 88,
  timing_trend: "on_time",
  uncertain_line_count: 0,
};

function response(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

describe("createKaraokeApiClient", () => {
  test("resolves the post community and maps the current readiness payload", async () => {
    const requests: Array<{ credentials: RequestCredentials | undefined; request: Request }> = [];
    const client = createKaraokeApiClient({
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push({ credentials: init?.credentials, request });
        return response(request.url.endsWith("/api/posts/pst%2F1") ? postDetail : readyPayload);
      },
      origin: "https://web.test/",
    });

    await expect(client.getPayload("pst/1")).resolves.toEqual({
      community: "com_1",
      id: "revision-1",
      instrumental_audio_url: "https://media.test/full-mix.mp3",
      karaoke_lines: readyPayload.karaoke_lines,
      object: "song_karaoke_payload",
      post: "pst_1",
      title: "Song",
    });
    expect(requests.map(({ request }) => request.url)).toEqual([
      "https://web.test/api/posts/pst%2F1",
      "https://web.test/api/communities/com_1/posts/pst%2F1/karaoke",
    ]);
    expect(requests.every(({ credentials }) => credentials === "same-origin")).toBe(true);
  });

  test("preserves the processing state instead of treating it as a ready payload", async () => {
    const client = createKaraokeApiClient({
      fetchImpl: async (input) => response(new URL(input.toString()).pathname.includes("/posts/")
        && !new URL(input.toString()).pathname.endsWith("/karaoke")
        ? postDetail
        : { reason: "alignment_pending", state: "processing" }),
      origin: "https://web.test",
    });

    const error = await client.getPayload("pst_1").catch((reason: KaraokeAvailabilityError) => reason);
    expect(error).toBeInstanceOf(KaraokeAvailabilityError);
    expect(error).toMatchObject({ code: "alignment_pending", retryable: true, state: "processing", status: 202 });
  });

  test("uses the attempts route with same-origin CSRF and idempotency headers", async () => {
    const requests: Array<{ credentials: RequestCredentials | undefined; request: Request }> = [];
    const client = createKaraokeApiClient({
      fetchImpl: async (input, init) => {
        requests.push({ credentials: init?.credentials, request: new Request(input, init) });
        return response(session, 201);
      },
      origin: "https://web.test",
      readCsrfToken: () => "csrf-1",
    });

    await expect(client.createSession({
      communityId: "com_1",
      idempotencyKey: "key-1",
      postId: "pst_1",
    })).resolves.toMatchObject({
      id: "session-1",
      scoring_policy: { kind: "enabled", retention: "stored" },
    });
    expect(requests[0]?.request.method).toBe("POST");
    expect(requests[0]?.request.url).toBe("https://web.test/api/communities/com_1/posts/pst_1/karaoke/attempts");
    expect(requests[0]?.request.headers.get("idempotency-key")).toBe("key-1");
    expect(requests[0]?.request.headers.get("x-csrf-token")).toBe("csrf-1");
    expect(requests[0]?.credentials).toBe("same-origin");
  });

  test("reads leaderboard and attempt through their generated contract paths", async () => {
    const requests: Request[] = [];
    const client = createKaraokeApiClient({
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return response(request.url.includes("/attempts/") ? attempt : leaderboard);
      },
      origin: "https://web.test",
    });

    await client.getLeaderboard({ communityId: "com_1", limit: 10, postId: "pst_1" });
    await client.getAttempt({ attemptId: "attempt-1", communityId: "com_1" });
    expect(requests.map((request) => request.url)).toEqual([
      "https://web.test/api/communities/com_1/posts/pst_1/karaoke/leaderboard?limit=10",
      "https://web.test/api/communities/com_1/karaoke/attempts/attempt-1",
    ]);
  });

  test("rejects protected writes when the readable CSRF cookie is absent", async () => {
    let requested = false;
    const client = createKaraokeApiClient({
      fetchImpl: async () => {
        requested = true;
        return response(session, 201);
      },
      origin: "https://web.test",
      readCsrfToken: () => undefined,
    });

    await expect(client.createSession({
      communityId: "com_1",
      idempotencyKey: "key-1",
      postId: "pst_1",
    })).rejects.toMatchObject({ code: "csrf_required", retryable: false, status: 403 });
    expect(requested).toBe(false);
  });

  test("preserves generated auth errors for the route sign-in gate", async () => {
    const client = createKaraokeApiClient({
      fetchImpl: async () => response({
        error: { code: "auth_error", message: "Sign in required", retryable: false },
      }, 401),
      origin: "https://web.test",
    });

    await expect(client.getLeaderboard({ communityId: "com_1", postId: "pst_1" }))
      .rejects.toMatchObject({ code: "auth_error", retryable: false, status: 401 });
  });

  test("rejects non-finite numeric sentinels accepted by the wire schema", async () => {
    const client = createKaraokeApiClient({
      fetchImpl: async () => response({ ...leaderboard, scoring_version: "NaN" }),
      origin: "https://web.test",
    });

    await expect(client.getLeaderboard({ communityId: "com_1", postId: "pst_1" }))
      .rejects.toMatchObject({ code: "invalid_karaoke_response", status: 502 });
  });
});
