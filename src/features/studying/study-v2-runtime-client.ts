import type { StudyAnswerResult, StudySession, StudyV2Api } from "./study-v2-api";
import type {
  StudyingAttemptInput,
  StudyingClient,
  StudyingLessonPayload,
} from "./studying-route-model";
import type { StudyingAttemptResult, StudyingServerExercise } from "./studying-model";

type StudySessionItem = StudySession["items"][number];

function orderedItems(session: StudySession): readonly StudySessionItem[] {
  const items = [...session.items].sort((left, right) => left.ordinal - right.ordinal);
  const currentId = session.lesson.current?.session_item_id;
  if (!currentId) return items;
  const current = items.find((item) => item.session_item_id === currentId);
  return current ? [current, ...items.filter((item) => item !== current)] : items;
}

function exerciseOf(item: StudySessionItem, currentId: string | undefined): StudyingServerExercise {
  const base = {
    id: item.session_item_id,
    line_index: item.ordinal,
    max_attempts: item.maximum_attempts,
    presentation_count: item.session_item_id === currentId ? 0 : undefined,
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

export function studyLessonPayload(session: StudySession): StudyingLessonPayload {
  const completed = session.status === "completed" || session.lesson.current === null;
  const currentId = session.lesson.current?.session_item_id;
  return {
    correct_count: session.progress.first_pass_correct,
    exercises: completed ? [] : orderedItems(session).map((item) => exerciseOf(item, currentId)),
    post_id: session.post_id,
    served_count: session.lesson.total_card_count,
    session_id: session.session_id,
  };
}

function attemptResult(result: StudyAnswerResult, maximumAttempts: number): StudyingAttemptResult {
  const feedback = result.feedback;
  return {
    attempts_remaining: result.attempt_state === "retryable"
      ? Math.max(1, maximumAttempts - result.attempt_number)
      : 0,
    correct_option_id: feedback.kind === "choice_reveal" ? feedback.correct_choice_key : undefined,
    heard_transcript: feedback.kind === "transcript_diff" ? feedback.heard_transcript : undefined,
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
      const shared = {
        attemptNumber: input.attempt_number,
        communityId: session.community_id,
        idempotencyKey: input.idempotency_key,
        sessionId: session.session_id,
        sessionItemId: input.exercise_id,
      };
      const result = input.type === "translation_choice"
        ? await options.api.submitChoice({ ...shared, choiceKey: input.selected_option_id })
        : await options.api.submitAudio({
            ...shared,
            audio: input.audio,
            audioDurationMs: input.audio_duration_ms,
            contentType: input.content_type,
          });
      session = result.session;
      return attemptResult(result, item.maximum_attempts);
    },
  };
}
