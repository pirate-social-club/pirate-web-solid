import type {
  StudyingAttemptResult,
  StudyingLessonState,
  StudyingServerExercise,
} from "./studying-model";

// Client seam for the studying route. The route view owns no network, mic, or
// timer policy of its own: every effectful operation is one of these injected
// interfaces, so stories and tests mock them at the seam.

export interface StudyingLessonPayload {
  post_id: string;
  title?: string;
  artwork_src?: string;
  locked?: boolean;
  price_label?: string;
  served_count?: number;
  session_id?: string;
  /** Pre-session streak snapshot; only the completion slot animation reads it. */
  previous_streak?: number;
  reward_label?: string;
  exercises: StudyingServerExercise[];
}

export interface StudyingAttemptInput {
  attempt_number: number;
  exercise_id: string;
  idempotency_key: string;
  selected_option_id?: string;
  session_id?: string;
  transcript?: string;
  type: "say_it_back" | "translation_choice";
}

export interface StudyingClient {
  loadLesson: (postId: string, signal?: AbortSignal) => Promise<StudyingLessonPayload>;
  submitAttempt: (input: StudyingAttemptInput) => Promise<StudyingAttemptResult>;
}

/** Microphone seam: start capture, stop and hand back what was heard. */
export interface StudyingRecorder {
  start: () => Promise<void>;
  stop: () => Promise<{ transcript?: string }>;
}

/** Rejection contract every studying client/recorder promise settles with. */
export interface StudyingAttemptRejection {
  status?: number;
  code?: string;
  message?: string;
}

export function attemptErrorStatus(rejection: StudyingAttemptRejection): number | undefined {
  return rejection.status;
}

export function isStudyingAuthError(rejection: StudyingAttemptRejection): boolean {
  return rejection.status === 401 || rejection.status === 403
    || rejection.code === "auth_error"
    || rejection.code === "unauthorized";
}

export function errorMessage(rejection: StudyingAttemptRejection | null, fallback: string): string {
  return rejection?.message?.trim() ? rejection.message : fallback;
}

/** Header progress: served cards minus what is still queued. */
export function lessonProgressOf(state: StudyingLessonState) {
  const totalCount = state.servedCount ?? state.exercises.length;
  return {
    resolvedCount: Math.max(0, totalCount - state.exerciseQueue.length),
    totalCount,
  };
}
