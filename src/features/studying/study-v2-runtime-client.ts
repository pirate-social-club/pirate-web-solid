import type { StudyAnswerResult, StudySession, StudyV2Api } from "./study-v2-api";
import type {
  StudyingAttemptInput,
  StudyingClient,
  StudyingLessonPayload,
} from "./studying-route-model";
import type { StudyingAttemptResult, StudyingServerExercise } from "./studying-model";

type StudySessionItem = StudySession["items"][number];

function exerciseOf(
  item: StudySessionItem,
  presentationNumber: number,
): StudyingServerExercise {
  const base = {
    id: item.session_item_id,
    line_index: item.ordinal,
    max_attempts: item.maximum_attempts,
    // The server's persisted presentation count drives the answer number the
    // reservation expects; a re-presented card resumes at its real position.
    presentation_count: presentationNumber - 1,
  };
  if (item.presentation.kind === "say_it_back") {
    return {
      ...base,
      type: "say_it_back",
      prompt_text: item.presentation.reference_text,
      reference_text: item.presentation.reference_text,
    };
  }
  return {
    ...base,
    type: "translation_choice",
    prompt_text: item.presentation.source_text,
    question: item.presentation.question,
    options: item.presentation.choices.map((choice) => ({
      id: choice.choice_key,
      text: choice.text,
    })),
  };
}

/**
 * The server's lesson state is the only progression authority: the payload
 * carries the server's current card (never a client-side queue), and the
 * surface completes only when the server completes.
 */
export function studyLessonPayload(session: StudySession): StudyingLessonPayload {
  const current = session.lesson.current;
  const completed = session.status === "completed" || current === null;
  const item =
    completed || current === null
      ? undefined
      : session.items.find(({ session_item_id }) => session_item_id === current.session_item_id);
  return {
    correct_count: session.progress.first_pass_correct,
    exercises: item === undefined ? [] : [exerciseOf(item, current.presentation_number)],
    post_id: session.post_id,
    resolved_count: session.lesson.resolved_card_count,
    served_count: session.lesson.total_card_count,
    session_id: session.session_id,
  };
}

function attemptResult(
  result: StudyAnswerResult,
  maximumAttempts: number,
): StudyingAttemptResult {
  const feedback = result.feedback;
  const diff = feedback.kind === "transcript_diff" ? feedback : undefined;
  return {
    attempt_state: result.attempt_state,
    attempts_remaining:
      result.attempt_state === "retryable"
        ? Math.max(1, maximumAttempts - result.attempt_number)
        : 0,
    correct_option_id: feedback.kind === "choice_reveal" ? feedback.correct_choice_key : undefined,
    diff:
      diff === undefined
        ? undefined
        : {
            extra: diff.extra,
            match_kind: diff.match_kind,
            matched: diff.matched,
            missing: diff.missing,
            substituted: diff.substituted,
          },
    heard_transcript: diff?.heard_transcript,
    match_kind: diff?.match_kind,
    outcome: result.outcome,
    session: {
      first_pass_correct_count: result.session.progress.first_pass_correct,
      status: result.session.status,
    },
  };
}

export interface StudyV2RuntimeClientOptions {
  api: StudyV2Api;
  initialSession: StudySession;
}

/** Adapts the generated v2 session and raw-answer contract to the shared Study surface seam. */
export function createStudyV2RuntimeClient(options: StudyV2RuntimeClientOptions): StudyingClient {
  let session = options.initialSession;

  return {
    async loadLesson(_postId, signal) {
      session = await options.api.getSession({
        communityId: session.community_id,
        sessionId: session.session_id,
        signal,
      });
      return studyLessonPayload(session);
    },
    async submitAttempt(input: StudyingAttemptInput) {
      const item = session.items.find((candidate) => candidate.session_item_id === input.exercise_id);
      if (!item) throw new Error("The current Study card is no longer in this session.");
      const result = input.type === "translation_choice"
        ? await options.api.submitChoice({
            attemptNumber: input.attempt_number,
            choiceKey: input.selected_option_id,
            communityId: session.community_id,
            idempotencyKey: input.idempotency_key,
            sessionId: session.session_id,
            sessionItemId: input.exercise_id,
          })
        : await options.api.submitAudio({
            attemptNumber: input.attempt_number,
            audio: input.audio,
            audioDurationMs: input.audio_duration_ms,
            communityId: session.community_id,
            contentType: input.content_type,
            idempotencyKey: input.idempotency_key,
            sessionId: session.session_id,
            sessionItemId: input.exercise_id,
          });
      session = result.session;
      return {
        ...attemptResult(result, item.maximum_attempts),
        next_lesson: studyLessonPayload(result.session),
      };
    },
  };
}
