import { describe, expect, test } from "bun:test";

import {
  applyServerLesson,
  caughtUpMessage,
  clampPercent,
  completeSurface,
  exerciseSurface,
  formatNextReviewLabel,
  isStudyAttemptDivergence,
  makeAttemptIdempotencyKey,
  primaryActionDisabled,
  primaryActionLabel,
  primaryActionVariant,
  previousStreakForAnimation,
  STUDY_ATTEMPT_DIVERGENCE_RECOVERY_LIMIT,
  toMultipleChoiceExercise,
  toSayItBackExercise,
  type StudyingAttemptResult,
  type StudyingLessonState,
  type StudyingServerExercise,
  type StudyingSurfaceState,
} from "./studying-model";

// Test cases ported from the legacy study-route behavioral suite
// (`web/src/app/authenticated-routes/study-route.test.tsx`, source checkout
// 0bc2ea7e8d427b5f5be8824d3943dad29c800f2c), re-expressed against the pure
// model. Progression cases run through applyServerLesson: the server's
// returned lesson state is the single progression authority.

const sayItBack = (id: string, overrides: Partial<StudyingServerExercise> = {}): StudyingServerExercise => ({
  id,
  type: "say_it_back",
  line_index: 0,
  prompt_text: `Prompt ${id}`,
  reference_text: `Reference ${id}`,
  ...overrides,
});

const multipleChoice = (id: string, overrides: Partial<StudyingServerExercise> = {}): StudyingServerExercise => ({
  id,
  type: "translation_choice",
  line_index: 1,
  prompt_text: `Prompt ${id}`,
  question: "What does this mean?",
  options: [
    { id: "a", text: "Option A" },
    { id: "b", text: "Option B" },
  ],
  ...overrides,
});

const lesson = (overrides: Partial<StudyingLessonState> = {}): StudyingLessonState => ({
  correctCount: 0,
  exercises: [sayItBack("ex-1")],
  servedCount: 4,
  surface: exerciseSurface(sayItBack("ex-1")),
  ...overrides,
});

describe("exercise adapters", () => {
  test("say-it-back adapter falls back to reference text and clamps max attempts", () => {
    const exercise = toSayItBackExercise(sayItBack("ex-1", { prompt_text: "", max_attempts: 0 }));
    expect(exercise.prompt).toBe("Reference ex-1");
    expect(exercise.expected).toBe("Reference ex-1");
    expect(exercise.maxAttempts).toBe(1);
    expect(exercise.lineNumber).toBe(1);
  });

  test("multiple-choice adapter withholds the correct option until an attempt lands", () => {
    const exercise = toMultipleChoiceExercise(multipleChoice("ex-2"));
    expect(exercise.correctOptionId).toBe("");
    expect(exercise.options).toHaveLength(2);
  });

  test("exerciseSurface defaults the attempt number to presentation_count + 1", () => {
    const surface = exerciseSurface(sayItBack("ex-1", { presentation_count: 2 }));
    expect(surface.kind).toBe("say_it_back");
    expect(surface.kind === "say_it_back" && surface.attemptNumber).toBe(3);
    expect(surface.kind === "say_it_back" && surface.phase).toBe("idle");
  });
});

describe("applyServerLesson", () => {
  test("advances to the server's next card after a correct attempt", () => {
    const state = lesson({ servedCount: 4 });
    const next = applyServerLesson(state, {
      next_lesson: { exercises: [multipleChoice("ex-2")], resolved_count: 1 },
      session: { first_pass_correct_count: 1, status: "active" },
    });
    expect(next.correctCount).toBe(1);
    expect(next.resolvedCount).toBe(1);
    expect(next.exercises).toHaveLength(1);
    expect(next.surface.kind).toBe("multiple_choice");
  });

  test("resumes a re-presented card at the server's presentation number", () => {
    const state = lesson({ servedCount: 4 });
    const next = applyServerLesson(state, {
      next_lesson: { exercises: [sayItBack("ex-1", { presentation_count: 1 })], resolved_count: 3 },
      session: { first_pass_correct_count: 3, status: "active" },
    });
    expect(next.surface.kind === "say_it_back" && next.surface.attemptNumber).toBe(2);
    expect(next.surface.kind === "say_it_back" && next.surface.exercise.id).toBe("ex-1");
  });

  test("completes only when the server reports no remaining current card", () => {
    const state = lesson({ servedCount: 4 });
    const completed = applyServerLesson(state, {
      next_lesson: { exercises: [], resolved_count: 4 },
      session: { first_pass_correct_count: 3, status: "completed" },
    });
    expect(completed.surface.kind).toBe("complete");
    if (completed.surface.kind === "complete") {
      expect(completed.surface.correctCount).toBe(3);
      expect(completed.surface.totalCount).toBe(4);
    }
  });

  test("an absent server lesson leaves the surface untouched", () => {
    const state = lesson();
    expect(applyServerLesson(state, {})).toBe(state);
  });

  test("prefers the server first-pass correct count over the local tally", () => {
    const state = lesson({ correctCount: 1 });
    const next = applyServerLesson(state, {
      next_lesson: { exercises: [sayItBack("ex-2")] },
      session: { first_pass_correct_count: 7, status: "active" },
    });
    expect(next.correctCount).toBe(7);
  });
});

describe("completeSurface", () => {
  test("maps snake_case study progress into the streak shape", () => {
    const lastAttemptResult: StudyingAttemptResult = {
      study_progress: {
        current_streak: 5,
        next_due_at: 1_800_000_000,
        qualified_today: true,
        study_attempt_count: 4,
        study_correct_count: 3,
        study_target_count: 10,
      },
    };
    const surface = completeSurface({ correctCount: 3, lastAttemptResult, totalCount: 4 });
    expect(surface.kind).toBe("complete");
    if (surface.kind === "complete") {
      expect(surface.scorePercent).toBe(75);
      expect(surface.streak).toEqual({
        currentStreak: 5,
        qualifiedToday: true,
        studyAttemptsToday: 4,
        studyCorrectCount: 3,
        studyTargetCount: 10,
      });
      expect(surface.nextReviewLabel).toBeDefined();
    }
  });

  test("scores zero when the lesson served nothing", () => {
    const surface = completeSurface({ correctCount: 0, totalCount: 0 });
    expect(surface.kind === "complete" && surface.scorePercent).toBe(0);
  });
});

describe("attempt integrity", () => {
  test("divergence is exactly the 400/404/409 status set", () => {
    expect(isStudyAttemptDivergence(400)).toBe(true);
    expect(isStudyAttemptDivergence(404)).toBe(true);
    expect(isStudyAttemptDivergence(409)).toBe(true);
    expect(isStudyAttemptDivergence(401)).toBe(false);
    expect(isStudyAttemptDivergence(500)).toBe(false);
    expect(isStudyAttemptDivergence(undefined)).toBe(false);
    expect(STUDY_ATTEMPT_DIVERGENCE_RECOVERY_LIMIT).toBe(2);
  });

  test("idempotency keys are namespaced per session/exercise/attempt", () => {
    expect(makeAttemptIdempotencyKey("ses-1", "ex-1", 2, "rand"))
      .toBe("study:ses-1:ex-1:2:rand");
  });
});

describe("review labels", () => {
  const now = 1_800_000_000_000;

  test("formatNextReviewLabel buckets match the legacy copy", () => {
    expect(formatNextReviewLabel(undefined, now)).toBeUndefined();
    expect(formatNextReviewLabel((now + 30_000) / 1000, now)).toBe("soon");
    expect(formatNextReviewLabel((now + 5 * 60_000) / 1000, now)).toBe("in 5 min");
    expect(formatNextReviewLabel((now + 3 * 3_600_000) / 1000, now)).toBe("in 3 hr");
    expect(formatNextReviewLabel((now + 86_400_000) / 1000, now)).toBe("tomorrow");
    expect(formatNextReviewLabel((now + 3 * 86_400_000) / 1000, now)).toBe("in 3 days");
  });

  test("caughtUpMessage appends the review time when due", () => {
    expect(caughtUpMessage(undefined, now)).toBe("You're caught up for this song.");
    expect(caughtUpMessage((now + 86_400_000) / 1000, now))
      .toBe("You're caught up for this song. Review again tomorrow to keep going.");
  });
});

describe("footer derivation", () => {
  const sayItBackSurface = (phase: "idle" | "listening" | "checking" | "wrong", extra: Partial<Extract<StudyingSurfaceState, { kind: "say_it_back" }>> = {}): StudyingSurfaceState => ({
    kind: "say_it_back",
    attemptNumber: 1,
    exercise: toSayItBackExercise(sayItBack("ex-1")),
    phase,
    ...extra,
  });

  test("locked state buys with or without a price label", () => {
    expect(primaryActionLabel({ kind: "locked" })).toBe("Buy");
    expect(primaryActionLabel({ kind: "locked", priceLabel: "$1.50" })).toBe("Buy $1.50");
  });

  test("say-it-back labels follow the phase machine", () => {
    expect(primaryActionLabel(sayItBackSurface("idle"))).toBe("Record");
    expect(primaryActionLabel(sayItBackSurface("listening"))).toBe("Stop");
    expect(primaryActionLabel(sayItBackSurface("checking"))).toBe("Checking…");
    expect(primaryActionLabel(sayItBackSurface("wrong"))).toBe("Record");
    expect(primaryActionLabel(sayItBackSurface("wrong", { revealReference: true }))).toBe("Continue");
  });

  test("multiple choice submits on selection and only offers a result action", () => {
    const base: Extract<StudyingSurfaceState, { kind: "multiple_choice" }> = {
      kind: "multiple_choice",
      attemptNumber: 1,
      exercise: toMultipleChoiceExercise(multipleChoice("ex-2")),
    };
    expect(primaryActionLabel(base)).toBeUndefined();
    expect(primaryActionLabel({ ...base, selectedOptionId: "opt-a" })).toBeUndefined();
    expect(primaryActionLabel({ ...base, submitting: true })).toBe("Checking…");
    expect(primaryActionLabel({ ...base, result: "correct" })).toBe("Continue");
    expect(primaryActionLabel({ ...base, result: "wrong" })).toBe("Continue");
    expect(primaryActionLabel({ ...base, result: "wrong", canRetry: true })).toBe("Try again");
  });

  test("variants and disabled states match the study reference", () => {
    expect(primaryActionVariant(sayItBackSurface("listening"))).toBe("secondary");
    expect(primaryActionVariant(sayItBackSurface("wrong"))).toBe("default");
    expect(primaryActionVariant(sayItBackSurface("idle"))).toBe("default");
    expect(primaryActionDisabled(sayItBackSurface("checking"))).toBe(true);
    expect(primaryActionDisabled(sayItBackSurface("listening"))).toBe(false);
  });

  test("percent clamp stays honest", () => {
    expect(clampPercent(120)).toBe(100);
    expect(clampPercent(-3)).toBe(0);
    expect(clampPercent(74.6)).toBe(75);
  });
});

describe("streak slot animation inputs", () => {
  test("previousStreakForAnimation clamps between zero and the current streak", () => {
    expect(previousStreakForAnimation(undefined, 3)).toBeUndefined();
    expect(previousStreakForAnimation({ currentStreak: 5 }, undefined)).toBe(4);
    expect(previousStreakForAnimation({ currentStreak: 5 }, 9)).toBe(5);
    expect(previousStreakForAnimation({ currentStreak: 5 }, -2)).toBe(0);
  });
});
