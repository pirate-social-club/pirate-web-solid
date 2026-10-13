import { describe, expect, test, vi } from "vitest";
import type { GuestStudySession, GuestStudyApi } from "./guest-study-api";
import { createGuestStudyAnswerJournal, createPageGuestStudyAnswerJournal } from "./guest-study-answer-journal";
import { createPageGuestStudyAnswerStorage } from "./guest-study-answer-storage";
import { createGuestStudyRuntimeClient, GuestStudyAuthorityRequiredError, GuestStudyPendingAttemptError } from "./guest-study-runtime-client";
import { guestAnswer, guestSession } from "./guest-study-test-fixtures";
import { studyLessonPayload } from "./study-lesson-projection";

const origin = "https://pirate.test";
const scopeOf = (session: GuestStudySession) => ({ origin, ownerId: session.owner_id, communityId: session.community_id, sessionId: session.session_id });
async function initializedJournal(session: GuestStudySession) {
  const journal = createPageGuestStudyAnswerJournal(origin);
  await journal.registerNewSession(scopeOf(session), { entryKind: "new_session", session });
  return journal;
}

describe("Guest practice runtime", () => {

  test("failed metadata commit prevents POST and preserves the exact local input", async () => {
    const initial = guestSession(), underlying = createPageGuestStudyAnswerStorage(origin);
    let fail = true;
    const journal = createGuestStudyAnswerJournal({ origin, profile: "page_only", storage: {
      ...underlying, mark: async marker => { if (fail) throw new Error("Owned metadata commit failed"); await underlying.mark(marker); },
    }, locks: { exclusive: work => work() } });
    await journal.registerNewSession(scopeOf(initial), { entryKind: "new_session", session: initial });
    const submit = vi.fn<GuestStudyApi["submitAnswer"]>(async () => guestAnswer(initial));
    const runtime = createGuestStudyRuntimeClient({ initialSession: initial, origin, answerJournal: journal,
      credentialId: "proof-1", api: { getSession: async () => initial, submitAnswer: submit } });
    const input = { type: "say_it_back" as const, audio: new Blob(["original"]), audio_duration_ms: 1,
      content_type: "audio/webm" as const, session_id: "session-1", exercise_id: "item-1", attempt_number: 1, idempotency_key: "original-key" };
    await expect(runtime.submitAttempt(input)).rejects.toBeInstanceOf(GuestStudyPendingAttemptError);
    expect(submit).not.toHaveBeenCalled(); fail = false;
    await runtime.submitAttempt(input);
    expect(submit).toHaveBeenCalledOnce(); expect(await journal.read(scopeOf(initial))).toBeNull();
  });

  test("lost metadata clear acknowledgment retries only local confirmation, never POST", async () => {
    const initial = guestSession(), underlying = createPageGuestStudyAnswerStorage(origin);
    let lose = true;
    const journal = createGuestStudyAnswerJournal({ origin, profile: "page_only", storage: {
      ...underlying, clearMatching: async marker => { await underlying.clearMatching(marker); if (lose) { lose = false; throw new Error("Owned clear COMMIT acknowledgment lost"); } },
    }, locks: { exclusive: work => work() } });
    await journal.registerNewSession(scopeOf(initial), { entryKind: "new_session", session: initial });
    const submit = vi.fn<GuestStudyApi["submitAnswer"]>(async () => guestAnswer(initial));
    const runtime = createGuestStudyRuntimeClient({ initialSession: initial, origin, answerJournal: journal,
      credentialId: "proof-1", api: { getSession: async () => initial, submitAnswer: submit } });
    const input = { type: "say_it_back" as const, audio: new Blob(["original"]), audio_duration_ms: 1,
      content_type: "audio/webm" as const, session_id: "session-1", exercise_id: "item-1", attempt_number: 1, idempotency_key: "original-key" };
    await expect(runtime.submitAttempt(input)).rejects.toBeInstanceOf(GuestStudyPendingAttemptError);
    await runtime.submitAttempt(input);
    expect(submit).toHaveBeenCalledOnce(); expect(await journal.read(scopeOf(initial))).toBeNull();
  });

  test("missing selected proof preserves its pending original and offers Guest renewal", async () => {
    const initial = guestSession(), journal = await initializedJournal(initial);
    let selected: string | null = null;
    const submit = vi.fn<GuestStudyApi["submitAnswer"]>(async () => guestAnswer(initial));
    const runtime = createGuestStudyRuntimeClient({ initialSession: initial, origin, answerJournal: journal,
      credentialId: () => selected, api: { getSession: async () => initial, submitAnswer: submit } });
    const input = { type: "say_it_back" as const, audio: new Blob(["original"]), audio_duration_ms: 1,
      content_type: "audio/webm" as const, session_id: "session-1", exercise_id: "item-1", attempt_number: 1, idempotency_key: "original-key" };
    await expect(runtime.submitAttempt(input)).rejects.toBeInstanceOf(GuestStudyAuthorityRequiredError);
    expect(submit).not.toHaveBeenCalled(); expect(await journal.read(scopeOf(initial))).not.toBeNull();
    selected = "proved-restored"; await runtime.submitAttempt(input);
    expect(submit).toHaveBeenCalledOnce(); expect(submit.mock.calls[0]?.[0].headers["idempotency-key"]).toBe("original-key");
  });

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
    const runtime = createGuestStudyRuntimeClient({ api: { submitAnswer: submit, getSession: async () => initial }, initialSession: initial, credentialId: "proof-1", origin, answerJournal: await initializedJournal(initial) });
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
    expect(submit.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal);
    expect(submit.mock.calls[1]?.[1]).toBeInstanceOf(AbortSignal);
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
    const runtime = createGuestStudyRuntimeClient({ initialSession: initial, origin, answerJournal: await initializedJournal(initial), credentialId: () => credentialId, api: { submitAnswer: submit, getSession: async () => initial } });
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
    const runtime = createGuestStudyRuntimeClient({ initialSession: initial, credentialId: "proof-1", origin, answerJournal: await initializedJournal(initial), readOnlyRecovery: true,
      api: { submitAnswer: submit, getSession: async () => initial } });
    expect((await runtime.loadLesson("post-1")).session_id).toBe("session-1");
    await expect(runtime.submitAttempt({ type: "say_it_back", audio: new Blob(["new"]), audio_duration_ms: 1,
      content_type: "audio/webm", session_id: "session-1", exercise_id: "item-1", attempt_number: 1, idempotency_key: "new-key" })).rejects.toBeInstanceOf(GuestStudyPendingAttemptError);
    expect(submit).not.toHaveBeenCalled();
  });

  test("foreign source or reward-capable response cannot become a practice lesson", () => {
    expect(() => createGuestStudyRuntimeClient({ initialSession: guestSession({ reward_mode: "megapot_guest_v1" }),
      credentialId: "proof-1", origin, answerJournal: createPageGuestStudyAnswerJournal(origin), api: { getSession: async () => guestSession(), submitAnswer: async () => guestAnswer(guestSession()) } })).toThrow("original source");
  });
});


test("rewarded answer recovery preserves original terms and updates financial projection only after metadata clear", async () => {
  const source = guestSession();
  const terms: NonNullable<GuestStudySession["reward_terms"]> = { community_id: source.community_id, post_id: source.post_id, audio_revision: source.audio_revision, lyrics_revision: source.lyrics_revision,
    offer_id: "offer", pool_leg_id: "leg", original_drawing_id: "123", qualification_policy_version_id: source.qualification_policy_revision,
    policy_hash: "a".repeat(64), terms_hash: "b".repeat(64), entry_cutoff_at: "2026-10-14T10:00:00.000Z", disclosure_version: "disclosure" };
  const initial = guestSession({ reward_mode: "megapot_guest_v1", reward_terms: terms, participation: { state: "not_yet_qualified" } });
  const journal = await initializedJournal(initial), changed = vi.fn();
  const wrong = { ...initial, reward_terms: { ...terms, pool_leg_id: "replacement" } };
  const admitted: GuestStudySession = { ...initial, participation: { state: "admitted", share_id: "share", original_drawing_id: "123", pool_leg_id: "leg" } };
  const submit = vi.fn<GuestStudyApi["submitAnswer"]>()
    .mockResolvedValueOnce({ ...guestAnswer(wrong), participation: wrong.participation })
    .mockResolvedValueOnce({ ...guestAnswer(admitted), participation: admitted.participation });
  const runtime = createGuestStudyRuntimeClient({ api: { getSession: async () => initial, submitAnswer: submit }, initialSession: initial,
    credentialId: "credential", origin, answerJournal: journal, onSessionChanged: changed });
  const original = { type: "say_it_back" as const, audio: new Blob(["original"]), audio_duration_ms: 1, content_type: "audio/webm" as const,
    session_id: initial.session_id, exercise_id: "item-1", attempt_number: 1, idempotency_key: "original" };
  await expect(runtime.submitAttempt(original)).rejects.toBeInstanceOf(GuestStudyPendingAttemptError);
  expect(changed).not.toHaveBeenCalled(); expect(await journal.read(scopeOf(initial))).not.toBeNull();
  await runtime.submitAttempt(original);
  expect(submit.mock.calls[0]?.[0]).toEqual(submit.mock.calls[1]?.[0]);
  expect(changed).toHaveBeenCalledWith(admitted); expect(await journal.read(scopeOf(initial))).toBeNull();
});


test("identical answer/session replacement admission cannot clear the original answer journal", async () => {
  const source = guestSession(), terms: NonNullable<GuestStudySession["reward_terms"]> = { community_id: source.community_id, post_id: source.post_id,
    audio_revision: source.audio_revision, lyrics_revision: source.lyrics_revision, offer_id: "offer", pool_leg_id: "leg", original_drawing_id: "123",
    qualification_policy_version_id: source.qualification_policy_revision, policy_hash: "a".repeat(64), terms_hash: "b".repeat(64),
    entry_cutoff_at: "2026-10-14T10:00:00.000Z", disclosure_version: "disclosure" };
  const initial = guestSession({ reward_mode: "megapot_guest_v1", reward_terms: terms, participation: { state: "not_yet_qualified" } });
  for (const wrong of [
    { ...initial, audio_revision: 2 }, { ...initial, lyrics_revision: 2 }, { ...initial, qualification_policy_revision: "replacement" },
    { ...initial, participation: { state: "admitted" as const, share_id: "share", original_drawing_id: "124", pool_leg_id: "leg" } },
    { ...initial, participation: { state: "admitted" as const, share_id: "share", original_drawing_id: "123", pool_leg_id: "replacement" } },
  ]) {
    const journal = await initializedJournal(initial), changed = vi.fn();
    const submit = vi.fn<GuestStudyApi["submitAnswer"]>().mockResolvedValue({ ...guestAnswer(wrong), participation: wrong.participation });
    const runtime = createGuestStudyRuntimeClient({ api: { getSession: async () => initial, submitAnswer: submit }, initialSession: initial,
      credentialId: "credential", origin, answerJournal: journal, onSessionChanged: changed });
    await expect(runtime.submitAttempt({ type: "say_it_back", audio: new Blob(["original"]), audio_duration_ms: 1, content_type: "audio/webm",
      session_id: initial.session_id, exercise_id: "item-1", attempt_number: 1, idempotency_key: "original" })).rejects.toBeInstanceOf(GuestStudyPendingAttemptError);
    expect(await journal.read(scopeOf(initial))).not.toBeNull(); expect(changed).not.toHaveBeenCalled();
  }
});
