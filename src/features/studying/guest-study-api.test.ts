import { describe, expect, test, vi } from "vitest";
import { createGuestStudyApi, GuestStudyLocalError } from "./guest-study-api.ts";

const credential = "A".repeat(22), csrf = "A".repeat(43);
const headers = { "x-guest-credential-id": credential };
const path = { communityId: "com_1", sessionId: "session_1", sessionItemId: "item_1" };
const start = {
  path: { communityId: "com_1", postId: "pst_1" }, headers,
  body: { idempotency_key: "original-start", expected_owner_id: "owner_original",
    target_language: null, learner_band: null, timezone: "Asia/Tbilisi",
    reward_mode: "practice_only" as const, reward_preview_terms_hash: null,
    disclosure: { version: "disclosure_1", accepted: true } },
};

function rejected() {
  return Response.json({ error: { code: "bad_request", message: "fixture stop", retryable: false,
    details: { reason_code: "guest_request_invalid" } } }, { status: 400 });
}

describe("genuine generated guest Study transport", () => {
  test("loads public preparation without guest/account credentials, consent or owner creation", async () => {
    const seen: Request[] = [];
    const readCsrfToken = vi.fn(() => csrf);
    const prepared = { object: "guest_study_prepared_content_v1", availability: {
      state: "ready", available_exercise_types: ["say_it_back", "translation_choice"],
      learning_language: "es", target_languages: ["en", "ar"], learner_bands: ["A1", "B1"],
    }, disclosure: { version: "disclosure_1", text: "Reviewed recording policy" }, reward_preview: null };
    const api = createGuestStudyApi({ origin: "https://member.test", readCsrfToken,
      fetchImpl: async (input, init) => { seen.push(new Request(input, init)); return Response.json(prepared); } });
    await expect(api.getPreparedContent({ path: { communityId: "com/1", postId: "pst/1" } })).resolves.toEqual(prepared);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://member.test/api/communities/com%2F1/posts/pst%2F1/study/public");
    expect(seen[0]?.credentials).toBe("omit");
    expect(seen[0]?.method).toBe("GET");
    expect(seen[0]?.headers.get("authorization")).toBeNull();
    expect(seen[0]?.headers.get("x-guest-csrf-token")).toBeNull();
    expect(seen[0]?.headers.get("x-guest-credential-id")).toBeNull();
    expect(readCsrfToken).not.toHaveBeenCalled();
  });

  test("preserves the original practice request then returns start lookup pending without a new key", async () => {
    const seen: Request[] = [];
    const api = createGuestStudyApi({ origin: "https://name.test", readCsrfToken: () => csrf,
      fetchImpl: async (input, init) => {
        const request = new Request(input, init); seen.push(request);
        return request.method === "POST" ? rejected() : Response.json({ state: "pending_confirmation", session: null });
      } });
    await expect(api.startSession(start)).rejects.toMatchObject({ status: 400, details: { reason_code: "guest_request_invalid" } });
    await expect(api.findStartOperation({ path: { ...start.path, idempotencyKey: start.body.idempotency_key }, headers }))
      .resolves.toEqual({ state: "pending_confirmation", session: null });
    const request = seen[0];
    if (request === undefined) throw new Error("Start request missing");
    expect(await request.json()).toEqual(start.body);
    expect(request.credentials).toBe("same-origin");
    expect(request.headers.get("x-guest-csrf-token")).toBe(csrf);
    expect(request.headers.get("x-guest-credential-id")).toBe(credential);
    expect(request.headers.get("x-csrf-token")).toBeNull();
    expect(request.headers.get("authorization")).toBeNull();
    expect(seen[1]?.url).toBe("https://name.test/api/communities/com_1/posts/pst_1/study/guest/v1/session-operations/original-start");
    expect(seen[1]?.headers.get("x-guest-csrf-token")).toBeNull();
    expect(seen).toHaveLength(2);
  });

  test("keeps exact audio bytes and metadata through the generated guest raw-answer method", async () => {
    const seen: Request[] = [];
    const api = createGuestStudyApi({ origin: "https://member.test", readCsrfToken: () => csrf,
      fetchImpl: async (input, init) => { seen.push(new Request(input, init)); return rejected(); } });
    const audio = new Uint8Array([0, 17, 128, 255]);
    await expect(api.submitAnswer({ path, body: audio, headers: { ...headers,
      "content-type": "audio/webm", "idempotency-key": "audio-original",
      "x-study-attempt-number": "2", "x-audio-duration-ms": "1250" } })).rejects.toMatchObject({ status: 400 });
    const request = seen[0];
    if (request === undefined) throw new Error("Audio request missing");
    expect(request.url).toBe("https://member.test/api/communities/com_1/study/guest/v1/sessions/session_1/items/item_1/answers");
    expect(request.headers.get("content-type")).toBe("audio/webm");
    expect(request.headers.get("idempotency-key")).toBe("audio-original");
    expect(request.headers.get("x-study-attempt-number")).toBe("2");
    expect(request.headers.get("x-audio-duration-ms")).toBe("1250");
    expect(request.headers.get("x-guest-csrf-token")).toBe(csrf);
    expect(new Uint8Array(await request.arrayBuffer())).toEqual(audio);
  });

  test("does not turn pending deletion or unknown provider disposition into success", async () => {
    const seen: Request[] = [];
    const result = { operation: { operation_kind: "learner_audio_deletion", idempotency_key: "delete-original", operation_id: "delete_1" },
      state: "pending", deleted_count: 0, remaining_count: 1, provider_disposition: "unknown" };
    const api = createGuestStudyApi({ origin: "https://name.test", readCsrfToken: () => csrf,
      fetchImpl: async (input, init) => { seen.push(new Request(input, init)); return Response.json(result, { status: 202 }); } });
    await expect(api.deleteLearnerAudio({ headers: { ...headers, "idempotency-key": "delete-original" } })).resolves.toEqual(result);
    expect(seen[0]?.method).toBe("DELETE");
    expect(seen[0]?.headers.get("idempotency-key")).toBe("delete-original");
    expect(seen[0]?.headers.get("x-guest-csrf-token")).toBe(csrf);
    expect(seen).toHaveLength(1);
  });

  test("sends future-only retention and keeps the server's effective acknowledgment", async () => {
    const seen: Request[] = [];
    const acknowledgment = { mode: "ephemeral", effective_at: "2026-10-13T10:00:00.000Z" };
    const api = createGuestStudyApi({ origin: "https://name.test", readCsrfToken: () => csrf,
      fetchImpl: async (input, init) => { seen.push(new Request(input, init)); return Response.json(acknowledgment); } });
    await expect(api.setLearningRetention({ headers, body: { idempotency_key: "retention-original", mode: "ephemeral" } }))
      .resolves.toEqual(acknowledgment);
    const request = seen[0];
    if (request === undefined) throw new Error("Retention request missing");
    expect(request.method).toBe("PUT");
    expect(request.url).toBe("https://name.test/api/guest/learning-retention");
    expect(await request.json()).toEqual({ idempotency_key: "retention-original", mode: "ephemeral" });
    expect(seen).toHaveLength(1);
  });

  test("refuses writes without guest CSRF and refuses over-bound requests before any dispatch", async () => {
    const fetchImpl = vi.fn(async () => rejected());
    const noCsrf = createGuestStudyApi({ origin: "https://name.test", fetchImpl, readCsrfToken: () => undefined });
    await expect(noCsrf.startSession(start)).rejects.toMatchObject({ code: "csrf_required" });
    const api = createGuestStudyApi({ origin: "https://name.test", fetchImpl, readCsrfToken: () => csrf });
    await expect(api.issueBootstrap({ headers: {}, body: { idempotency_key: "é".repeat(2_048) } }))
      .rejects.toMatchObject({ code: "request_too_large" });
    await expect(api.submitAnswer({ path, body: new Uint8Array(524_289), headers: { ...headers,
      "content-type": "audio/webm", "idempotency-key": "large", "x-study-attempt-number": "1", "x-audio-duration-ms": "1000" } }))
      .rejects.toBeInstanceOf(GuestStudyLocalError);
    await expect(api.submitAnswer({ path, body: new Uint8Array([1]), headers: { ...headers,
      "content-type": "audio/webm", "idempotency-key": "long", "x-study-attempt-number": "1", "x-audio-duration-ms": "60001" } }))
      .rejects.toMatchObject({ code: "audio_invalid" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
