import { describe, expect, test, vi } from "vitest";
import type { GuestStudyApi } from "./guest-study-api";
import { createGuestStudyRuntimeClient, GuestStudyPendingAttemptError } from "./guest-study-runtime-client";
import { guestAnswer, guestSession } from "./guest-study-test-fixtures";
import { studyLessonPayload } from "./study-lesson-projection";

describe("Guest practice runtime", () => {
  test("projects real server current/progress and no account streak or reward", () => {
    const source = guestSession({ lesson: { ...guestSession().lesson, current: {
      session_item_id: "item-3", presentation_number: 2, is_reappearance: true, presented_at: "2026-10-13T10:00:00Z",
    }, resolved_card_count: 2 } });
    expect(studyLessonPayload(source)).toMatchObject({ resolved_count: 2, served_count: 4,
      exercises: [{ id: "item-3", presentation_count: 1 }] });
    expect(studyLessonPayload(source)).not.toHaveProperty("previous_streak");
    expect(studyLessonPayload(source)).not.toHaveProperty("reward_label");
  });

  test("unknown audio retains exact bytes/key and refuses different rerecord before original result", async () => {
    const initial = guestSession();
    const submit = vi.fn<GuestStudyApi["submitAnswer"]>();
    submit.mockRejectedValueOnce(new Error("Owned connection uncertainty"));
    submit.mockResolvedValueOnce(guestAnswer({ ...initial, lesson: { ...initial.lesson,
      current: { session_item_id: "item-2", presentation_number: 1, is_reappearance: false, presented_at: "2026-10-13T10:00:00Z" },
      resolved_card_count: 1 } }));
    const runtime = createGuestStudyRuntimeClient({ api: { submitAnswer: submit, getSession: async () => initial }, initialSession: initial, credentialId: "proof-1" });
    const input = { type: "say_it_back" as const, audio: new Blob(["original"], { type: "audio/webm" }),
      audio_duration_ms: 1000, content_type: "audio/webm" as const, exercise_id: "item-1",
      attempt_number: 1, session_id: "session-1", idempotency_key: "original-key" };
    await expect(runtime.submitAttempt(input)).rejects.toBeInstanceOf(GuestStudyPendingAttemptError);
    await expect(runtime.submitAttempt({ ...input, audio: new Blob(["different"]), idempotency_key: "replacement-key" })).rejects.toBeInstanceOf(GuestStudyPendingAttemptError);
    await expect(runtime.loadLesson("post-1")).rejects.toBeInstanceOf(GuestStudyPendingAttemptError);
    expect(submit).toHaveBeenCalledTimes(1);
    const result = await runtime.submitAttempt(input);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[0]?.[0]).toEqual(submit.mock.calls[1]?.[0]);
    expect(submit.mock.calls[0]?.[0].body).toBe(input.audio);
    expect(submit.mock.calls[0]?.[0].headers).toMatchObject({ "idempotency-key": "original-key", "x-study-attempt-number": "1", "x-audio-duration-ms": "1000", "x-guest-credential-id": "proof-1" });
    expect(result.next_lesson?.exercises[0]?.id).toBe("item-2");
  });

  test("JSON answer uses genuine single_select shape and actual credential selection", async () => {
    const source = guestSession();
    const initial = { ...source, items: source.items.map(item => item.session_item_id === "item-1" ? {
      ...item, exercise_type: "translation_choice" as const, presentation: {
        kind: "translation_choice" as const, capture: "choice_selection" as const,
        source_text: "Sing line 1", question: "Choose the translation",
        choices: [{ choice_key: "choice-1", text: "A" }, { choice_key: "choice-2", text: "B" }],
      },
    } : item) };
    let credentialId = "proof-old";
    const submit = vi.fn<GuestStudyApi["submitAnswer"]>(async () => ({ ...guestAnswer(initial), exercise_type: "translation_choice" }));
    const runtime = createGuestStudyRuntimeClient({ initialSession: initial, credentialId: () => credentialId, api: { submitAnswer: submit, getSession: async () => initial } });
    credentialId = "proof-confirmed-successor";
    await runtime.submitAttempt({ type: "translation_choice", selected_option_id: "choice-1",
      attempt_number: 1, exercise_id: "item-1", session_id: "session-1", idempotency_key: "choice-key" });
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ body: { kind: "single_select", choice_key: "choice-1" },
      headers: { "content-type": "application/json", "idempotency-key": "choice-key", "x-guest-credential-id": "proof-confirmed-successor" },
      path: { communityId: "community-1", sessionId: "session-1", sessionItemId: "item-1" } });
  });

  test("reload-resumed practice can be read but cannot create a new answer", async () => {
    const initial = guestSession();
    const submit = vi.fn<GuestStudyApi["submitAnswer"]>();
    const runtime = createGuestStudyRuntimeClient({ initialSession: initial, credentialId: "proof-1", readOnlyRecovery: true,
      api: { submitAnswer: submit, getSession: async () => initial } });
    expect((await runtime.loadLesson("post-1")).session_id).toBe("session-1");
    await expect(runtime.submitAttempt({ type: "say_it_back", audio: new Blob(["new"]), audio_duration_ms: 1,
      content_type: "audio/webm", session_id: "session-1", exercise_id: "item-1", attempt_number: 1, idempotency_key: "new-key" })).rejects.toBeInstanceOf(GuestStudyPendingAttemptError);
    expect(submit).not.toHaveBeenCalled();
  });

  test("foreign source or reward-capable response cannot become a practice lesson", () => {
    expect(() => createGuestStudyRuntimeClient({ initialSession: guestSession({ reward_mode: "megapot_guest_v1" }),
      credentialId: "proof-1", api: { getSession: async () => guestSession(), submitAnswer: async () => guestAnswer(guestSession()) } })).toThrow("original source");
  });
});
