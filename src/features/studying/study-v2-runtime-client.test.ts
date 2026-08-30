import { describe, expect, test, vi } from "vitest";

import type { StudySession, StudyV2Api } from "./study-v2-api";
import { createStudyV2RuntimeClient, studyLessonPayload } from "./study-v2-runtime-client";

function session(): StudySession {
  return {
    audio_revision: 1,
    community_id: "community-1",
    completed_at: null,
    created_at: "2026-08-30T10:00:00Z",
    items: [{
      answer_visibility: "always_visible",
      exercise_review_key: "review-1",
      exercise_type: "say_it_back",
      exercise_variant: "spoken-v1",
      exercise_version_id: "version-1",
      feedback_policy_revision: "feedback-v1",
      feedback_release: "every_graded_attempt",
      grader_policy_revision: "grader-v1",
      language_profile_revision: null,
      languages: { learning_language: "es", target_language: null },
      learner_band: null,
      line: {
        audio_revision: 1,
        line_source_hash: "hash-1",
        line_version: 1,
        lyric_line_id: "line-1",
        lyrics_revision: 1,
        post_id: "post-1",
        study_unit_id: "unit-1",
      },
      maximum_attempts: 3,
      object: "study_session_item_v2",
      ordinal: 0,
      presentation: {
        capture: "microphone_audio",
        kind: "say_it_back",
        reference_text: "Sing this line",
      },
      quality_policy_revision: "quality-v1",
      session_item_id: "item-1",
    }],
    language_profile_revision: null,
    languages: { learning_language: "es", target_language: null },
    learner_band: null,
    lesson: {
      completion_reason: null,
      current: {
        is_reappearance: false,
        presentation_number: 1,
        presented_at: "2026-08-30T10:00:00Z",
        session_item_id: "item-1",
      },
      presentation_cap: 10,
      presentation_count: 1,
      resolved_card_count: 0,
      total_card_count: 1,
    },
    lyrics_revision: 1,
    object: "study_session_v2",
    persona_id: "persona-1",
    post_id: "post-1",
    progress: {
      answered_exercise_count: 0,
      first_pass_correct: 0,
      qualifying_exercise_count: 1,
      required_correct: 1,
      score_bps: null,
    },
    qualification_policy_revision: "qualification-v1",
    selection_policy_revision: "selection-v1",
    session_id: "session-1",
    source_set_revision: 1,
    status: "active",
    study_profile_revision: 1,
    timezone: "UTC",
  };
}

describe("Study v2 runtime client", () => {
  test("maps the server-owned current card without turning its presentation number into an answer attempt", () => {
    expect(studyLessonPayload(session())).toMatchObject({
      correct_count: 0,
      post_id: "post-1",
      served_count: 1,
      session_id: "session-1",
      exercises: [{
        id: "item-1",
        max_attempts: 3,
        presentation_count: 0,
        prompt_text: "Sing this line",
        reference_text: "Sing this line",
        type: "say_it_back",
      }],
    });
  });

  test("submits exact raw audio and projects server transcript feedback", async () => {
    const current = session();
    const submitAudio = vi.fn(async () => ({
      attempt_number: 1,
      attempt_state: "retryable" as const,
      exercise_type: "say_it_back" as const,
      feedback: {
        extra: [],
        heard_transcript: "Sing the line",
        kind: "transcript_diff" as const,
        matched: [],
        missing: [],
        policy_revision: "feedback-v1",
        substituted: [],
      },
      first_pass: false,
      object: "study_answer_result_v2" as const,
      outcome: "incorrect" as const,
      session: current,
      session_item_id: "item-1",
    }));
    const unused = async (): Promise<never> => { throw new Error("unused"); };
    const api = {
      createSession: async () => current,
      deleteLearnerAudio: async () => ({
        deleted_count: 0,
        last_deleted_at: null,
        object: "learner_audio_deletion" as const,
        remaining_count: 0,
      }),
      getSession: vi.fn(async () => current),
      loadAvailability: unused,
      requestGeneration: unused,
      submitAudio,
      submitChoice: unused,
    } satisfies StudyV2Api;
    const client = createStudyV2RuntimeClient({ api, initialSession: current });
    const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });

    await expect(client.submitAttempt({
      attempt_number: 1,
      audio,
      audio_duration_ms: 900,
      content_type: "audio/webm",
      exercise_id: "item-1",
      idempotency_key: "attempt-1",
      session_id: "session-1",
      type: "say_it_back",
    })).resolves.toMatchObject({
      attempts_remaining: 2,
      heard_transcript: "Sing the line",
      outcome: "incorrect",
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
});
