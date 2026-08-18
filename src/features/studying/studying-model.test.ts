import { describe, expect, test } from "bun:test";

import {
  advanceLesson,
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
  STUDY_MAX_ATTEMPTS_PER_APPEARANCE,
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
// model: the legacy cases rendered the React page with a mocked API; here the
// same transitions run through advanceLesson/exerciseSurface directly.

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
  exerciseQueue: [0],
  exercises: [sayItBack("ex-1")],
  presentationCounts: {},
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

describe("advanceLesson", () => {
  // Ported from "advances straight to the next exercise after a correct
  // say-it-back attempt".
  test("advances straight to the next exercise after a correct first-pass attempt", () => {
    const state = lesson({
      exerciseQueue: [0, 1],
      exercises: [sayItBack("ex-1"), multipleChoice("ex-2")],
    });
    const next = advanceLesson(state, "correct");
    expect(next.correctCount).toBe(1);
    expect(next.exerciseQueue).toEqual([1]);
    expect(next.surface.kind).toBe("multiple_choice");
    expect(next.presentationCounts["ex-1"]).toBe(1);
  });

  // Ported from "retries a missed say-it-back in place while attempts remain"
  // (the in-place retry is a surface-phase concern; the queue only re-enters
  // the card once the appearance is spent — modeled by requeueing).
  test("requeues a missed card with intervening prompts while attempts remain", () => {
    const state = lesson({
      exerciseQueue: [0, 1, 2, 3, 4],
      exercises: [sayItBack("ex-1"), sayItBack("ex-2"), sayItBack("ex-3"), sayItBack("ex-4"), sayItBack("ex-5")],
      lastAttemptResult: { attempts_remaining: 2, session: { status: "active" } },
    });
    const next = advanceLesson(state, "wrong");
    // Miss goes back 3 deep: two or three different prompts before the retry.
    expect(next.exerciseQueue).toEqual([1, 2, 3, 0, 4]);
    expect(next.correctCount).toBe(0);
    expect(next.surface.kind).toBe("say_it_back");
    expect(next.surface.kind === "say_it_back" && next.surface.exercise.id).toBe("ex-2");
  });

  test("requeues with at least one intervening prompt in a short lesson", () => {
    const state = lesson({
      exerciseQueue: [0, 1],
      exercises: [sayItBack("ex-1"), sayItBack("ex-2")],
      lastAttemptResult: { attempts_remaining: 1, session: { status: "active" } },
    });
    expect(advanceLesson(state, "wrong").exerciseQueue).toEqual([1, 0]);
  });

  // Ported from "shows completion without a restart action when every
  // exercise is exhausted": with nothing else to show, a miss must not loop.
  test("ends the lesson instead of re-presenting the last card after a miss", () => {
    const state = lesson({
      lastAttemptResult: { attempts_remaining: 2, session: { status: "active" } },
    });
    const next = advanceLesson(state, "wrong");
    expect(next.surface.kind).toBe("complete");
    expect(next.exerciseQueue).toEqual([]);
  });

  test("ends the lesson when the server session is no longer active", () => {
    const state = lesson({
      exerciseQueue: [0, 1],
      exercises: [sayItBack("ex-1"), sayItBack("ex-2")],
      lastAttemptResult: { attempts_remaining: 2, session: { status: "completed" } },
    });
    expect(advanceLesson(state, "wrong").surface.kind).toBe("complete");
  });

  test("does not requeue when no attempts remain", () => {
    const state = lesson({
      exerciseQueue: [0, 1],
      exercises: [sayItBack("ex-1"), sayItBack("ex-2")],
      lastAttemptResult: { attempts_remaining: 0, session: { status: "active" } },
    });
    const next = advanceLesson(state, "wrong");
    expect(next.exerciseQueue).toEqual([1]);
  });

  test("prefers the server first-pass correct count over the local tally", () => {
    const state = lesson({
      correctCount: 1,
      lastAttemptResult: { session: { status: "active", first_pass_correct_count: 7 } },
    });
    expect(advanceLesson(state, "correct").correctCount).toBe(7);
  });

  test("resumes a re-presented card at its recorded attempt number", () => {
    const state = lesson({
      exerciseQueue: [0, 1],
      exercises: [sayItBack("ex-1"), sayItBack("ex-2")],
      presentationCounts: { "ex-2": 2 },
    });
    const next = advanceLesson(state, "correct");
    expect(next.surface.kind === "say_it_back" && next.surface.attemptNumber).toBe(3);
  });

  test("completes with the served count and a clamped score percent", () => {
    const state = lesson({ correctCount: 2, servedCount: 3 });
    const next = advanceLesson(state, "correct");
    expect(next.surface.kind).toBe("complete");
    if (next.surface.kind === "complete") {
      expect(next.surface.correctCount).toBe(3);
      expect(next.surface.scorePercent).toBe(100);
      expect(next.surface.totalCount).toBe(3);
    }
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

  test("multiple choice only offers a footer action after a result", () => {
    const base: Extract<StudyingSurfaceState, { kind: "multiple_choice" }> = {
      kind: "multiple_choice",
      attemptNumber: 1,
      exercise: toMultipleChoiceExercise(multipleChoice("ex-2")),
    };
    expect(primaryActionLabel(base)).toBeUndefined();
    expect(primaryActionLabel({ ...base, submitting: true })).toBe("Checking…");
    expect(primaryActionLabel({ ...base, result: "correct" })).toBe("Continue");
    expect(primaryActionLabel({ ...base, result: "wrong" })).toBe("Continue");
    expect(primaryActionLabel({ ...base, result: "wrong", canRetry: true })).toBe("Try again");
  });

  test("variants and disabled states match the legacy mapping", () => {
    expect(primaryActionVariant(sayItBackSurface("listening"))).toBe("secondary");
    expect(primaryActionVariant(sayItBackSurface("wrong"))).toBe("destructive");
    expect(primaryActionVariant(sayItBackSurface("idle"))).toBe("default");
    expect(primaryActionDisabled(sayItBackSurface("checking"))).toBe(true);
    expect(primaryActionDisabled(sayItBackSurface("listening"))).toBe(false);
  });

  test("per-appearance retry cap and percent clamp stay honest", () => {
    expect(STUDY_MAX_ATTEMPTS_PER_APPEARANCE).toBe(2);
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
