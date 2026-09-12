import { describe, expect, test, vi } from "vitest";

import type { StudySession, StudyV2Api } from "./study-v2-api";
import { createStudyV2RuntimeClient, studyLessonPayload } from "./study-v2-runtime-client";

function session(activeOverrides: Partial<StudySession> = {}): StudySession {
  return {
    audio_revision: 1,
    community_id: "community-1",
    completed_at: null,
    created_at: "2026-08-30T10:00:00Z",
    items: [1, 2, 3, 4].map((index) => ({
      answer_visibility: "always_visible",
      exercise_review_key: `review-${index}`,
      exercise_type: "say_it_back",
      exercise_variant: "spoken-v1",
      exercise_version_id: `version-${index}`,
      feedback_policy_revision: "feedback-v1",
      feedback_release: "every_graded_attempt",
      grader_policy_revision: "script_aware_token_phonetic_v3",
      language_profile_revision: null,
      languages: { learning_language: "en", target_language: null },
      learner_band: null,
      line: {
        audio_revision: 1,
        line_source_hash: `hash-${index}`,
        line_version: 1,
        lyric_line_id: `line-${index}`,
        lyrics_revision: 1,
        post_id: "post-1",
        study_unit_id: `unit-${index}`,
      },
      maximum_attempts: 3,
      object: "study_session_item_v2",
      ordinal: index - 1,
      presentation: {
        capture: "microphone_audio",
        kind: "say_it_back",
        reference_text: `Sing line ${index}`,
      },
      quality_policy_revision: "quality-v1",
      session_item_id: `item-${index}`,
    })),
    language_profile_revision: null,
    languages: { learning_language: "en", target_language: null },
    learner_band: null,
    lesson: {
      completion_reason: null,
      current: {
        is_reappearance: false,
        presentation_number: 1,
        presented_at: "2026-08-30T10:00:00Z",
        session_item_id: "item-1",
      },
      presentation_cap: 12,
      presentation_count: 1,
      resolved_card_count: 0,
      total_card_count: 4,
    },
    lyrics_revision: 1,
    object: "study_session_v2",
    persona_id: "persona-1",
    post_id: "post-1",
    progress: {
      answered_exercise_count: 0,
      first_pass_correct: 0,
      qualifying_exercise_count: 4,
      required_correct: 3,
      score_bps: null,
    },
    qualification_policy_revision: "qualification-v1",
    selection_policy_revision: "selection-v1",
    session_id: "session-1",
    source_set_revision: 1,
    status: "active",
    study_profile_revision: 1,
    timezone: "UTC",
    ...activeOverrides,
  };
}

function withCurrent(
  source: StudySession,
  current: StudySession["lesson"]["current"],
  lessonOverrides: Partial<StudySession["lesson"]> = {},
  progressOverrides: Partial<StudySession["progress"]> = {},
): StudySession {
  return {
    ...source,
    lesson: { ...source.lesson, ...lessonOverrides, current },
    progress: { ...source.progress, ...progressOverrides },
  };
}

function spokenResult(input: {
  attemptNumber: number;
  correct: boolean;
  session: StudySession;
}) {
  return {
    attempt_number: input.attemptNumber,
    attempt_state: "spent" as const,
    exercise_type: "say_it_back" as const,
    feedback: input.correct
      ? { kind: "none" as const }
      : {
          extra: ["murmur"],
          heard_transcript: "sing murmur",
          kind: "transcript_diff" as const,
          match_kind: "none" as const,
          matched: [],
          missing: [
            { token: "line", position: 1 },
            { token: "1", position: 2 },
          ],
          policy_revision: "feedback-v1",
          substituted: [{ expected: { token: "sing", position: 0 }, heard: "murmur" }],
        },
    first_pass: input.attemptNumber === 1,
    object: "study_answer_result_v2" as const,
    outcome: input.correct ? ("correct" as const) : ("incorrect" as const),
    session: input.session,
    session_item_id: input.session.lesson.current?.session_item_id ?? "item-1",
  };
}

describe("Study v2 runtime client", () => {
  test("renders only the server's current card at its real presentation number", () => {
    const current = {
      is_reappearance: true,
      presentation_number: 2,
      presented_at: "2026-08-30T10:05:00Z",
      session_item_id: "item-3",
    };
    expect(studyLessonPayload(withCurrent(session(), current, { resolved_card_count: 2 })))
      .toMatchObject({
        correct_count: 0,
        post_id: "post-1",
        resolved_count: 2,
        served_count: 4,
        session_id: "session-1",
        exercises: [{
          id: "item-3",
          max_attempts: 3,
          presentation_count: 1,
          prompt_text: "Sing line 3",
          reference_text: "Sing line 3",
          type: "say_it_back",
        }],
      });
  });

  test("renders no exercises once the server completes the lesson", () => {
    const completed = {
      ...session(),
      completed_at: "2026-08-30T10:10:00Z",
      lesson: {
        ...session().lesson,
        completion_reason: "all_resolved",
        current: null,
        resolved_card_count: 4,
      },
      status: "completed" as const,
    };
    expect(studyLessonPayload(completed).exercises).toEqual([]);
  });

  test("advances to the server's next card and keeps the spoken diff after a miss", async () => {
    const initial = session();
    const afterMiss = withCurrent(
      initial,
      {
        is_reappearance: false,
        presentation_number: 1,
        presented_at: "2026-08-30T10:01:00Z",
        session_item_id: "item-2",
      },
      { resolved_card_count: 0 },
    );
    const submitAudio = vi.fn(async () => spokenResult({
      attemptNumber: 1,
      correct: false,
      session: afterMiss,
    }));
    const unused = async (): Promise<never> => {
      throw new Error("unused");
    };
    const api = {
      createSession: async () => initial,
      deleteLearnerAudio: async () => ({
        deleted_count: 0,
        last_deleted_at: null,
        object: "learner_audio_deletion" as const,
        remaining_count: 0,
      }),
      getSession: vi.fn(async () => initial),
      loadAvailability: unused,
      requestGeneration: unused,
      submitAudio,
      submitChoice: unused,
    } satisfies StudyV2Api;
    const client = createStudyV2RuntimeClient({ api, initialSession: initial });
    const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });

    const result = await client.submitAttempt({
      attempt_number: 1,
      audio,
      audio_duration_ms: 900,
      content_type: "audio/webm",
      exercise_id: "item-1",
      idempotency_key: "attempt-1",
      session_id: "session-1",
      type: "say_it_back",
    });

    expect(result).toMatchObject({
      attempt_state: "spent",
      attempts_remaining: 0,
      heard_transcript: "sing murmur",
      match_kind: "none",
      outcome: "incorrect",
      session: { status: "active" },
    });
    expect(result.diff?.missing).toEqual([
      { token: "line", position: 1 },
      { token: "1", position: 2 },
    ]);
    expect(result.diff?.substituted).toEqual([
      { expected: { token: "sing", position: 0 }, heard: "murmur" },
    ]);
    expect(result.next_lesson?.exercises[0]).toMatchObject({
      id: "item-2",
      presentation_count: 0,
    });
    expect(submitAudio).toHaveBeenCalledWith({
      attemptNumber: 1,
      audio,
      audioDurationMs: 900,
      communityId: "community-1",
      contentType: "audio/webm",
      idempotencyKey: "attempt-1",
      sessionId: "session-1",
      sessionItemId: "item-1",
    });
  });

  test("keeps the same card with one fewer attempt after a retryable choice miss", async () => {
    const initial = session();
    const choiceItem = 2;
    const items = initial.items.map((item, index) =>
      index === choiceItem - 1
        ? {
            ...item,
            exercise_type: "translation_choice" as const,
            presentation: {
              kind: "translation_choice" as const,
              question: "What does this mean?",
              source_text: "source",
              choices: [
                { choice_key: "a", text: "Option A" },
                { choice_key: "b", text: "Option B" },
              ],
            },
          }
        : item,
    );
    const choiceSession = { ...initial, items };
    const afterRetryableMiss = withCurrent(
      choiceSession,
      {
        is_reappearance: false,
        presentation_number: 2,
        presented_at: "2026-08-30T10:00:00Z",
        session_item_id: "item-2",
      },
      { resolved_card_count: 0 },
    );
    const submitChoice = vi.fn(async () => ({
      attempt_number: 1,
      attempt_state: "retryable" as const,
      exercise_type: "translation_choice" as const,
      feedback: { kind: "none" as const },
      first_pass: true,
      object: "study_answer_result_v2" as const,
      outcome: "incorrect" as const,
      session: afterRetryableMiss,
      session_item_id: "item-2",
    }));
    const unused = async (): Promise<never> => {
      throw new Error("unused");
    };
    const api = {
      createSession: async () => choiceSession,
      deleteLearnerAudio: async () => ({
        deleted_count: 0,
        last_deleted_at: null,
        object: "learner_audio_deletion" as const,
        remaining_count: 0,
      }),
      getSession: vi.fn(async () => choiceSession),
      loadAvailability: unused,
      requestGeneration: unused,
      submitAudio: unused,
      submitChoice,
    } satisfies StudyV2Api;
    const client = createStudyV2RuntimeClient({ api, initialSession: choiceSession });

    const result = await client.submitAttempt({
      attempt_number: 1,
      exercise_id: "item-2",
      idempotency_key: "choice-1",
      selected_option_id: "a",
      session_id: "session-1",
      type: "translation_choice",
    });

    expect(result).toMatchObject({
      attempt_state: "retryable",
      attempts_remaining: 2,
      outcome: "incorrect",
    });
    expect(result.next_lesson?.exercises[0]).toMatchObject({
      id: "item-2",
      presentation_count: 1,
    });
  });

  test("reloads the server's current card after a returning re-presentation", async () => {
    const initial = session();
    const returning = withCurrent(
      initial,
      {
        is_reappearance: true,
        presentation_number: 2,
        presented_at: "2026-08-30T10:08:00Z",
        session_item_id: "item-1",
      },
      { resolved_card_count: 3 },
    );
    const unused = async (): Promise<never> => {
      throw new Error("unused");
    };
    const api = {
      createSession: async () => initial,
      deleteLearnerAudio: async () => ({
        deleted_count: 0,
        last_deleted_at: null,
        object: "learner_audio_deletion" as const,
        remaining_count: 0,
      }),
      getSession: vi.fn(async () => returning),
      loadAvailability: unused,
      requestGeneration: unused,
      submitAudio: unused,
      submitChoice: unused,
    } satisfies StudyV2Api;
    const client = createStudyV2RuntimeClient({ api, initialSession: initial });

    const payload = await client.loadLesson("post-1");

    expect(payload.exercises).toHaveLength(1);
    expect(payload.exercises[0]).toMatchObject({
      id: "item-1",
      presentation_count: 1,
    });
    expect(api.getSession).toHaveBeenCalledWith({
      communityId: "community-1",
      sessionId: "session-1",
      signal: undefined,
    });
  });
});
