import type { GuestStudyApi, GuestStudySession, GuestStudyPreparedContent, GuestStudyAnswerResult } from "./guest-study-api";

export function guestSession(activeOverrides: Partial<GuestStudySession> = {}): GuestStudySession {
  const items: GuestStudySession["items"] = [1, 2, 3, 4].map((index) => ({
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
    }));
  return {
    audio_revision: 1,
    community_id: "community-1",
    completed_at: null,
    created_at: "2026-08-30T10:00:00Z",
    items,
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
      presentation_cap: 20,
      presentation_count: 1,
      resolved_card_count: 0,
      total_card_count: 4,
    },
    lyrics_revision: 1,
    object: "guest_study_session_v1",
    actor: { kind: "guest" },
    owner_id: "100",
    expires_at: "2026-10-14T10:00:00Z",
    reward_mode: "practice_only",
    reward_terms: null,
    participation: { state: "practice_only" },
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


export function prepared(): GuestStudyPreparedContent {
  return { object: "guest_study_prepared_content_v1", availability: {
    state: "ready", available_exercise_types: ["say_it_back", "translation_choice"],
    learning_language: "en", target_languages: ["ar", "zh"], learner_bands: ["A1", "B1"],
  }, disclosure: { version: "actual-disclosure-v1", text: "This is the server's actual recording disclosure." }, reward_preview: null };
}
export function guestApi(overrides: Partial<GuestStudyApi> = {}): GuestStudyApi {
  const unused = async (): Promise<never> => { throw new Error("Unexpected API effect"); };
  const api: GuestStudyApi = {
    getPreparedContent: unused, discoverAuthority: unused, issueBootstrap: unused,
    confirmBootstrap: unused, renewAuthority: unused, rotateCredential: unused,
    acknowledgeCredential: unused, cleanupProof: unused, startSession: unused,
    findStartOperation: unused, getSession: unused, submitAnswer: unused,
    listParticipations: unused, setLearningRetention: unused, deleteLearnerAudio: unused,
    createAttachmentIntent: unused,
  };
  return Object.assign(api, overrides);
}
export function guestAnswer(session: GuestStudySession): GuestStudyAnswerResult {
  return { object: "guest_study_answer_result_v1", session_item_id: "item-1", attempt_number: 1,
    exercise_type: "say_it_back", first_pass: true, attempt_state: "spent", outcome: "correct",
    feedback: { kind: "none" }, session, participation: { state: "practice_only" } };
}
