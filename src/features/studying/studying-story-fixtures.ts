// Shared fixtures for the studying Storybook stories. These mirror the shapes
// exercised in studying-model.test.ts; no fixture touches the network, the
// mic, or timers.
import type {
  StudyingMultipleChoiceExercise,
  StudyingSayItBackExercise,
  StudyingServerExercise,
} from "./studying-model";
import {
  toMultipleChoiceExercise,
  toSayItBackExercise,
} from "./studying-model";
import type {
  StudyingAttemptInput,
  StudyingClient,
  StudyingLessonPayload,
  StudyingRecorder,
} from "./studying-route-model";

export const storyPostId = "pst_study1";

export const storySayItBackServerExercise: StudyingServerExercise = {
  id: "ex-say-1",
  type: "say_it_back",
  line_index: 0,
  max_attempts: 3,
  prompt_text: "Sail away with me tonight",
  reference_text: "Sail away with me tonight",
  translation_text: "Navigue avec moi ce soir",
};

export const storyMultipleChoiceServerExercise: StudyingServerExercise = {
  id: "ex-mc-1",
  type: "translation_choice",
  line_index: 1,
  max_attempts: 2,
  prompt_text: "Under a paper moon",
  question: "What does this line mean?",
  options: [
    { id: "opt-a", text: "Sous une lune de papier" },
    { id: "opt-b", text: "Sur une mer de papier" },
    { id: "opt-c", text: "Sous un soleil de plomb" },
  ],
};

export const storySayItBackExercise: StudyingSayItBackExercise =
  toSayItBackExercise(storySayItBackServerExercise);

export const storyMultipleChoiceExercise: StudyingMultipleChoiceExercise =
  toMultipleChoiceExercise(storyMultipleChoiceServerExercise);

export const storyLessonPayload: StudyingLessonPayload = {
  post_id: storyPostId,
  title: "Paper Moon",
  served_count: 2,
  session_id: "ses_story1",
  previous_streak: 4,
  reward_label: "+25 $MOON",
  exercises: [storySayItBackServerExercise, storyMultipleChoiceServerExercise],
};

export function storyCorrectAttempt(input: StudyingAttemptInput) {
  return {
    attempts_remaining: 2,
    correct_option_id: input.type === "translation_choice" ? "opt-a" : undefined,
    outcome: "correct" as const,
    session: { first_pass_correct_count: 1, status: "active" },
    study_progress: {
      current_streak: 5,
      next_due_at: Math.floor(Date.now() / 1000) + 86_400,
      qualified_today: true,
      study_attempt_count: 2,
      study_correct_count: 2,
      study_target_count: 10,
    },
  };
}

export function storyWrongAttempt(input: StudyingAttemptInput) {
  return {
    attempts_remaining: 1,
    correct_option_id: input.type === "translation_choice" ? "opt-a" : undefined,
    outcome: "incorrect" as const,
    session: { status: "active" },
  };
}

/** Lesson client that always serves the story lesson. */
export function createStoryLessonClient(
  overrides: Partial<StudyingClient> = {},
): StudyingClient {
  return {
    loadLesson: async () => storyLessonPayload,
    submitAttempt: async (input) => storyCorrectAttempt(input),
    ...overrides,
  };
}

/** Client whose load answers 401, exercising the auth-required state. */
export function createAuthRequiredClient(): StudyingClient {
  const error = Object.assign(new Error("Sign in required"), { status: 401 });
  return {
    loadLesson: async () => { throw error; },
    submitAttempt: async () => { throw error; },
  };
}

/** Client whose load fails transiently, exercising the retry state. */
export function createFailingClient(message = "Connection lost while loading the lesson."): StudyingClient {
  return {
    loadLesson: async () => { throw new Error(message); },
    submitAttempt: async () => { throw new Error(message); },
  };
}

/** Recorder seam that never touches a real microphone. */
export function createStoryRecorder(transcript = "Sail away with me tonight"): StudyingRecorder {
  return {
    start: async () => {},
    stop: async () => ({ transcript }),
  };
}
