import { describe, expect, test, vi } from "vitest";
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

const instrumentalPayload = {
  ...readyPayload,
  playback_kind: "instrumental",
  playback_audio: { kind: "instrumental", ref: "media://immutable/song/instrumental/1" },
};

const instrumentalBinding = {
  post_id: "pst_1",
  community_id: "com_1",
  karaoke_revision_id: "revision-1",
  playback_audio: instrumentalPayload.playback_audio,
};

function instrumentalClient(payload: object = instrumentalPayload, grant: object = {}, status = 200) {
  const requests: Request[] = [];
  const client = createKaraokeApiClient({
    origin: "https://web.test",
    readCsrfToken: () => "csrf-1",
    fetchImpl: async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.endsWith("/api/posts/pst_1")) return response(postDetail);
      if (request.url.endsWith("/karaoke")) return response(payload);
      if (!request.url.endsWith("/karaoke/playback-access")) throw new Error("Unexpected full-mix request");
      return response({
        ...instrumentalBinding,
        kind: "instrumental",
        playback_url: "https://media.test/signed/instrumental.mp3",
        expires_at: Math.floor(Date.now() / 1000) + 900,
        renew_after: Math.floor(Date.now() / 1000) + 840,
        ...grant,
      }, status);
    },
  });
  return { client, requests };
}

describe("instrumental playback access", () => {
  test.each(["media://immutable/song/instrumental/1", "https://media.test/ungranted.mp3"])(
    "uses only the instrumental grant for readiness ref %s", async ref => {
      const { client, requests } = instrumentalClient(
        { ...instrumentalPayload, playback_audio: { kind: "instrumental", ref } },
        { playback_audio: { kind: "instrumental", ref } },
      );
      const payload = await client.getPayload("pst_1");
      expect(payload.instrumental_audio_url).toBe("https://media.test/signed/instrumental.mp3");
      expect(payload.playback_access).toMatchObject({ kind: "instrumental", ref });
      expect(requests.map(request => new URL(request.url).pathname)).toEqual([
        "/api/posts/pst_1", "/api/communities/com_1/posts/pst_1/karaoke", "/api/posts/pst_1/karaoke/playback-access",
      ]);
      expect(requests[2]?.headers.get("x-csrf-token")).toBe("csrf-1");
      await expect(requests[2]?.json()).resolves.toEqual({ community_id: "com_1", karaoke_revision_id: "revision-1", playback_ref: ref });
    },
  );

  test.each([
    { post_id: "another-post" },
    { community_id: "another-community" },
    { playback_audio: { kind: "full_mix", ref: "media://immutable/full-mix/1" } },
    { playback_audio: { kind: "instrumental", ref: "" } },
  ])("rejects inconsistent readiness before asking for access: %j", async overrides => {
    const { client, requests } = instrumentalClient({ ...instrumentalPayload, ...overrides });
    await expect(client.getPayload("pst_1")).rejects.toMatchObject({ code: "invalid_playback_grant" });
    expect(requests).toHaveLength(2);
  });

  test.each([
    { kind: "full_mix" },
    { post_id: "another-post" },
    { community_id: "another-community" },
    { karaoke_revision_id: "revision-2" },
    { playback_audio: { kind: "full_mix", ref: instrumentalPayload.playback_audio.ref } },
    { playback_audio: { kind: "instrumental", ref: "media://immutable/song/other-instrumental" } },
    { playback_audio: undefined },
    { playback_url: "http://media.test/instrumental.mp3" },
    { playback_url: "https://user:password@media.test/instrumental.mp3" },
    { playback_url: "media://immutable/song/instrumental/1" },
    { expires_at: 1, renew_after: 0 },
    { expires_at: 2_000_000_000, renew_after: 2_000_000_001 },
  ])("rejects a mismatched or invalid grant without a full-mix fallback: %j", async grant => {
    const { client, requests } = instrumentalClient(instrumentalPayload, grant);
    await expect(client.getPayload("pst_1")).rejects.toBeInstanceOf(Error);
    expect(requests).toHaveLength(3);
  });

  test("preserves access refusal without requesting another endpoint", async () => {
    const { client, requests } = instrumentalClient(instrumentalPayload, {
      error: { code: "not_found", message: "Song not found", retryable: false },
    }, 404);
    await expect(client.getPayload("pst_1")).rejects.toMatchObject({ status: 404 });
    expect(requests).toHaveLength(3);
  });

  test.each([
    { karaoke_revision_id: "revision-2" },
    { playback_audio: { kind: "instrumental", ref: "media://immutable/song/changed-instrumental" } },
    { playback_kind: "full_mix", playback_audio: { kind: "full_mix", ref: "media://immutable/song/full-mix" } },
  ])("renewal refuses changed readiness before minting a different source: %j", async patch => {
    const { client, requests } = instrumentalClient({ ...instrumentalPayload, ...patch });
    await expect(client.getPayload("pst_1", undefined, {
      communityId: "com_1", revisionId: "revision-1", kind: "instrumental", ref: instrumentalPayload.playback_audio.ref,
    })).rejects.toMatchObject({ code: "karaoke_source_changed" });
    expect(requests).toHaveLength(2);
  });

  test("renewal pins the original admitted source in a fresh grant request", async () => {
    const { client, requests } = instrumentalClient();
    await client.getPayload("pst_1", undefined, {
      communityId: "com_1", revisionId: "revision-1", kind: "instrumental", ref: instrumentalPayload.playback_audio.ref,
    });
    await expect(requests[2]?.json()).resolves.toEqual({
      community_id: "com_1", karaoke_revision_id: "revision-1", playback_ref: instrumentalPayload.playback_audio.ref,
    });
  });

  test("an interrupted grant request cannot return playable media", async () => {
    const controller = new AbortController();
    let release: ((value: Response) => void) | undefined;
    const client = createKaraokeApiClient({
      origin: "https://web.test",
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        if (request.url.endsWith("/api/posts/pst_1")) return response(postDetail);
        if (request.url.endsWith("/karaoke")) return response(instrumentalPayload);
        expect(init?.signal).toBe(controller.signal);
        return new Promise<Response>(resolve => { release = resolve; });
      },
    });
    const pending = client.getPayload("pst_1", controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(release).toBeDefined());
    controller.abort();
    release!(response({ ...instrumentalBinding, kind: "instrumental", playback_url: "https://media.test/signed/instrumental.mp3", expires_at: 2_000_000_000, renew_after: 1_999_999_000 }));
    await rejected;
  });
});

describe("createKaraokeApiClient", () => {
  test("resolves the post community and maps the current readiness payload", async () => {
    const requests: Array<{ credentials: RequestCredentials | undefined; request: Request }> = [];
    const client = createKaraokeApiClient({
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push({ credentials: init?.credentials, request });
        return response(request.url.endsWith("/api/posts/pst%2F1")
          ? { ...postDetail, post: { ...postDetail.post, id: "pst/1" } }
          : { ...readyPayload, post_id: "pst/1" });
      },
      origin: "https://web.test/",
    });

    await expect(client.getPayload("pst/1")).resolves.toEqual({
      community: "com_1",
      id: "revision-1",
      instrumental_audio_url: "https://media.test/full-mix.mp3",
      karaoke_lines: readyPayload.karaoke_lines,
      object: "song_karaoke_payload",
      post: "pst/1",
      title: "Song",
    });
    expect(requests.map(({ request }) => request.url)).toEqual([
      "https://web.test/api/posts/pst%2F1",
      "https://web.test/api/communities/com_1/posts/pst%2F1/karaoke",
    ]);
    expect(requests.every(({ credentials }) => credentials === "same-origin")).toBe(true);
  });

  test("resolves a media reference to signed playback access before giving it to the audio player", async () => {
    const requests: Request[] = [];
    const client = createKaraokeApiClient({
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url.endsWith("/song/playback-access")) {
          return response({
            kind: "full_mix",
            playback_url: "https://media.test/signed/full-mix.mp3",
            expires_at: 2_000_000_000,
            renew_after: 1_999_999_000,
          });
        }
        if (request.url.endsWith("/api/posts/pst_1")) return response(postDetail);
        return response({
          ...readyPayload,
          playback_audio: { kind: "full_mix", ref: "media://immutable/song/audio/1" },
        });
      },
      origin: "https://web.test",
      readCsrfToken: () => "csrf-1",
    });

    await expect(client.getPayload("pst_1")).resolves.toMatchObject({
      instrumental_audio_url: "https://media.test/signed/full-mix.mp3",
    });
    expect(requests.map((request) => request.url)).toEqual([
      "https://web.test/api/posts/pst_1",
      "https://web.test/api/communities/com_1/posts/pst_1/karaoke",
      "https://web.test/api/posts/pst_1/song/playback-access",
    ]);
    expect(requests[2]?.headers.get("x-csrf-token")).toBe("csrf-1");
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
      personaId: "persona-1",
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
    await expect(requests[0]?.request.json()).resolves.toEqual({ persona_id: "persona-1" });
  });

  test.each(["", "   ", undefined])("rejects missing persona %s before any request", async (personaId) => {
    const fetchImpl = vi.fn();
    const client = createKaraokeApiClient({ fetchImpl, origin: "https://web.test", readCsrfToken: () => "csrf-1" });
    // SAFETY: deliberately violate the compile-time field to prove the runtime fence.
    await expect(client.createSession({
      communityId: "com_1", postId: "pst_1", idempotencyKey: "key-1",
      personaId: personaId as string,
    })).rejects.toMatchObject({ code: "persona_required" });
    expect(fetchImpl).not.toHaveBeenCalled();
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
      personaId: "persona-1",
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
