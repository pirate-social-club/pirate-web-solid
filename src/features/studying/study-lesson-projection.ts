import type { StudyAnswerResult, StudySession } from "./study-v2-api";
import type { GuestStudyAnswerResult, GuestStudySession } from "./guest-study-api";
import type { StudyingLessonPayload } from "./studying-route-model";
import type { StudyingAttemptResult, StudyingServerExercise } from "./studying-model";

type SharedStudySession = StudySession | GuestStudySession;
type StudySessionItem = SharedStudySession["items"][number];

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
export function studyLessonPayload(session: SharedStudySession): StudyingLessonPayload {
  const current = session.lesson.current;
  let item: StudySessionItem | undefined;
  let presentationNumber = 0;
  if (current !== null && session.status !== "completed") {
    const currentItemId = current.session_item_id;
    item = session.items.find(({ session_item_id }) => session_item_id === currentItemId);
    presentationNumber = current.presentation_number;
  }
  return {
    correct_count: session.progress.first_pass_correct,
    exercises: item === undefined ? [] : [exerciseOf(item, presentationNumber)],
    post_id: session.post_id,
    resolved_count: session.lesson.resolved_card_count,
    served_count: session.lesson.total_card_count,
    session_id: session.session_id,
  };
}

export function studyAttemptResult(
  result: StudyAnswerResult | GuestStudyAnswerResult,
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
            match_kind: diff.match_kind ?? "none",
            matched: diff.matched,
            missing: diff.missing,
            substituted: diff.substituted,
          },
    heard_transcript: diff?.heard_transcript,
    match_kind: diff?.match_kind ?? "none",
    outcome: result.outcome,
    session: {
      first_pass_correct_count: result.session.progress.first_pass_correct,
      status: result.session.status,
    },
  };
}

