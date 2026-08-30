import { describe, expect, test } from "vitest";
import {
  createStudyV2Api,
  StudyV2LocalError,
  type StudyAvailability,
} from "./study-v2-api";

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

const availability = {
  available_exercise_types: ["say_it_back", "translation_choice"],
  learner_bands: ["A1", "A2", "B1"],
  learning_language: "es",
  state: "ready",
  target_languages: ["en", "ar"],
} satisfies StudyAvailability;

function response(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function rejectedRequest(): Response {
  return response({
    error: { code: "bad_request", message: "fixture stop", retryable: false },
  }, 400);
}

describe("createStudyV2Api", () => {
  test("resolves the community and preserves the explicit Study availability contract", async () => {
    const requests: Request[] = [];
    const api = createStudyV2Api({
      fetchImpl: async (input, init) => {
        const request = new Request(input, init);
        requests.push(request);
        return response(request.url.endsWith("/api/posts/pst%2F1") ? postDetail : availability);
      },
      origin: "https://web.test",
    });

    await expect(api.loadAvailability("pst/1")).resolves.toEqual({
      availability,
      communityId: "com_1",
    });
    expect(requests.map((request) => request.url)).toEqual([
      "https://web.test/api/posts/pst%2F1",
      "https://web.test/api/communities/com_1/posts/pst%2F1/study/v2",
    ]);
  });

  test("sends explicit language, band, persona, timezone, and idempotency values", async () => {
    const requests: Request[] = [];
    const api = createStudyV2Api({
      fetchImpl: async (input, init) => {
        requests.push(new Request(input, init));
        return rejectedRequest();
      },
      origin: "https://web.test",
      readCsrfToken: () => "csrf-1",
    });

    await expect(api.requestGeneration({
      communityId: "com_1",
      learnerBand: "B1",
      postId: "pst_1",
      targetLanguage: "en",
    })).rejects.toMatchObject({ code: "bad_request", status: 400 });
    await expect(api.createSession({
      communityId: "com_1",
      idempotencyKey: "session-key",
      learnerBand: "B1",
      personaId: "persona-1",
      postId: "pst_1",
      targetLanguage: "en",
      timezone: "Asia/Tbilisi",
    })).rejects.toMatchObject({ code: "bad_request", status: 400 });

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      "POST https://web.test/api/communities/com_1/posts/pst_1/study/v2/generations",
      "POST https://web.test/api/communities/com_1/posts/pst_1/study/v2/sessions",
    ]);
    const generationRequest = requests[0];
    const sessionRequest = requests[1];
    if (generationRequest === undefined || sessionRequest === undefined) throw new Error("Study requests missing");
    const generationBody = await generationRequest.json();
    const sessionBody = await sessionRequest.json();
    expect(generationBody).toEqual({ learner_band: "B1", target_language: "en" });
    expect(sessionBody).toEqual({
      idempotency_key: "session-key",
      learner_band: "B1",
      persona_id: "persona-1",
      target_language: "en",
      timezone: "Asia/Tbilisi",
    });
    expect(requests.every((request) => request.headers.get("x-csrf-token") === "csrf-1")).toBe(true);
  });

  test("keeps captured audio bytes intact and sends answer metadata as headers", async () => {
    const requests: Request[] = [];
    const api = createStudyV2Api({
      fetchImpl: async (input, init) => {
        requests.push(new Request(input, init));
        return rejectedRequest();
      },
      origin: "https://web.test",
      readCsrfToken: () => "csrf-1",
    });
    const audio = new Uint8Array([0, 17, 128, 255]);

    await expect(api.submitAudio({
      attemptNumber: 2,
      audio,
      audioDurationMs: 1_250,
      communityId: "com_1",
      contentType: "audio/webm",
      idempotencyKey: "audio-key",
      sessionId: "session-1",
      sessionItemId: "item-1",
    })).rejects.toMatchObject({ code: "bad_request", status: 400 });

    const request = requests[0];
    if (request === undefined) throw new Error("audio request missing");
    expect(request.url).toBe("https://web.test/api/communities/com_1/study/v2/sessions/session-1/items/item-1/answers");
    expect(request.headers.get("content-type")).toBe("audio/webm");
    expect(request.headers.get("idempotency-key")).toBe("audio-key");
    expect(request.headers.get("x-study-attempt-number")).toBe("2");
    expect(request.headers.get("x-audio-duration-ms")).toBe("1250");
    expect(request.headers.get("x-csrf-token")).toBe("csrf-1");
    expect(new Uint8Array(await request.arrayBuffer())).toEqual(audio);
  });

  test("sends choice answers as exact JSON without audio-only headers", async () => {
    const requests: Request[] = [];
    const api = createStudyV2Api({
      fetchImpl: async (input, init) => {
        requests.push(new Request(input, init));
        return rejectedRequest();
      },
      origin: "https://web.test",
      readCsrfToken: () => "csrf-1",
    });

    await expect(api.submitChoice({
      attemptNumber: 1,
      choiceKey: "choice-c",
      communityId: "com_1",
      idempotencyKey: "choice-key",
      sessionId: "session-1",
      sessionItemId: "item-2",
    })).rejects.toMatchObject({ code: "bad_request", status: 400 });

    const request = requests[0];
    if (request === undefined) throw new Error("choice request missing");
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(request.headers.get("x-audio-duration-ms")).toBeNull();
    const choiceBody = await request.json();
    expect(choiceBody).toEqual({ choice_key: "choice-c", kind: "single_select" });
  });

  test("deletes retained learner audio through the protected current route", async () => {
    const requests: Request[] = [];
    const api = createStudyV2Api({
      fetchImpl: async (input, init) => {
        requests.push(new Request(input, init));
        return response({
          deleted_count: 2,
          last_deleted_at: "2026-08-30T10:00:00Z",
          object: "learner_audio_deletion",
          remaining_count: 0,
        });
      },
      origin: "https://web.test",
      readCsrfToken: () => "csrf-1",
    });

    await expect(api.deleteLearnerAudio()).resolves.toMatchObject({ deleted_count: 2, remaining_count: 0 });
    expect(requests[0]?.method).toBe("DELETE");
    expect(requests[0]?.url).toBe("https://web.test/api/users/me/learner-audio");
    expect(requests[0]?.headers.get("x-csrf-token")).toBe("csrf-1");
  });

  test("does not send Study writes without the readable CSRF cookie", async () => {
    let requested = false;
    const api = createStudyV2Api({
      fetchImpl: async () => {
        requested = true;
        return rejectedRequest();
      },
      origin: "https://web.test",
      readCsrfToken: () => undefined,
    });

    await expect(api.requestGeneration({
      communityId: "com_1",
      learnerBand: "A1",
      postId: "pst_1",
      targetLanguage: "en",
    })).rejects.toBeInstanceOf(StudyV2LocalError);
    expect(requested).toBe(false);
  });
});
