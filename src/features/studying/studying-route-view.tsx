import { createSignal, Show } from "solid-js";
import { Title } from "@solidjs/meta";

import {
  AuthRequiredRouteState,
  RouteLoadFailureState,
  RouteLoadingState,
} from "../../design-system";
import {
  advanceLesson,
  completeSurface,
  exerciseSurface,
  isStudyAttemptDivergence,
  lockedSurface,
  makeAttemptIdempotencyKey,
  STUDY_ATTEMPT_DIVERGENCE_RECOVERY_LIMIT,
  STUDY_MAX_ATTEMPTS_PER_APPEARANCE,
  type StudyingLessonState,
  type StudyingSurfaceState,
} from "./studying-model";
import {
  attemptErrorStatus,
  errorMessage,
  isStudyingAuthError,
  lessonProgressOf,
  type StudyingAttemptRejection,
  type StudyingClient,
  type StudyingLessonPayload,
  type StudyingRecorder,
} from "./studying-route-model";
import { StudyingSurface } from "./studying-surface";

// Route-level view for the studying activity. All effectful work (payload
// load, attempt submission, mic capture, the multiple-choice auto-advance
// delay) is injected; the view only sequences the surface state machine.
// Mirrors the legacy `study-route.tsx` controller minus Telegram handoff and
// feedback audio, which are out of scope for this lane.

export interface StudyingRouteViewProps {
  postId: string;
  client: StudyingClient;
  /** Mic seam. Absent recorder => the say-it-back card explains it cannot record. */
  recorder?: StudyingRecorder;
  /** Auto-advance scheduler after a correct multiple-choice answer (legacy: 700 ms). */
  scheduleAdvance?: (run: () => void) => void;
  onExit?: () => void;
  onKaraoke?: () => void;
  onStudyAgain?: () => void;
  onConnect?: () => void;
}

type SayItBackSurfaceState = Extract<StudyingSurfaceState, { kind: "say_it_back" }>;
type MultipleChoiceSurfaceState = Extract<StudyingSurfaceState, { kind: "multiple_choice" }>;

function defaultScheduleAdvance(run: () => void): void {
  if (typeof window === "undefined") return;
  window.setTimeout(run, 700);
}

function requestSignIn(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("pirate:connect"));
  }
}

function LoadedStudyingLesson(props: StudyingRouteViewProps & {
  onAuthRequired: () => void;
  onReload: () => void;
  payload: StudyingLessonPayload;
}) {
  const initialQueue = () => props.payload.exercises.map((_, index) => index);
  const [lesson, setLesson] = createSignal<StudyingLessonState>({
    correctCount: 0,
    exerciseQueue: initialQueue(),
    exercises: props.payload.exercises,
    presentationCounts: {},
    previousStreak: props.payload.previous_streak,
    servedCount: props.payload.served_count,
    surface: props.payload.exercises.length > 0
      ? exerciseSurface(props.payload.exercises[0]!)
      : completeSurface({ correctCount: 0, totalCount: 0 }),
  });
  let divergenceRecoveries = 0;
  const idempotencyKeys = new Map<string, string>();

  const attemptIdempotencyKey = (exerciseId: string, attemptNumber: number): string => {
    const logical = `${props.payload.session_id}:${exerciseId}:${attemptNumber}`;
    const existing = idempotencyKeys.get(logical);
    if (existing) return existing;
    const created = makeAttemptIdempotencyKey(props.payload.session_id ?? "", exerciseId, attemptNumber);
    idempotencyKeys.set(logical, created);
    return created;
  };

  const recoverFromDivergence = (): boolean => {
    if (divergenceRecoveries >= STUDY_ATTEMPT_DIVERGENCE_RECOVERY_LIMIT) return false;
    divergenceRecoveries += 1;
    props.onReload();
    return true;
  };

  /** Narrowed surface updaters: the guard runs once, the update sees a typed card. */
  const updateSayItBack = (
    exerciseId: string,
    update: (surface: SayItBackSurfaceState, current: StudyingLessonState) => StudyingLessonState,
  ) => {
    setLesson((current) => current.surface.kind === "say_it_back" && current.surface.exercise.id === exerciseId
      ? update(current.surface, current)
      : current);
  };

  const updateMultipleChoice = (
    exerciseId: string,
    update: (surface: MultipleChoiceSurfaceState, current: StudyingLessonState) => StudyingLessonState,
  ) => {
    setLesson((current) => current.surface.kind === "multiple_choice" && current.surface.exercise.id === exerciseId
      ? update(current.surface, current)
      : current);
  };

  const submitAttempt = (input: Parameters<StudyingClient["submitAttempt"]>[0]) => {
    const exerciseId = input.exercise_id;
    void props.client.submitAttempt(input).then((result) => {
      // A landed attempt proves we are back in step with the server; spend the
      // recovery budget again only if we drift a second time.
      divergenceRecoveries = 0;
      if (input.type === "translation_choice") {
        updateMultipleChoice(exerciseId, (surface, current) => {
          if (result.outcome === "correct") {
            // The green highlight stays on the selected option briefly, then
            // the lesson moves on without a "correct" banner.
            (props.scheduleAdvance ?? defaultScheduleAdvance)(() => {
              updateMultipleChoice(exerciseId, (latest, state) => latest.result === "correct"
                ? advanceLesson(state, "correct")
                : state);
            });
          }
          return {
            ...current,
            lastAttemptResult: result,
            surface: {
              ...surface,
              exercise: {
                ...surface.exercise,
                correctOptionId: result.correct_option_id ?? surface.exercise.correctOptionId,
              },
              canRetry: false,
              result: result.outcome === "correct" ? "correct" as const : "wrong" as const,
              submitting: false,
            },
          };
        });
        return;
      }
      updateSayItBack(exerciseId, (surface, current) => {
        if (result.outcome === "correct") {
          return advanceLesson({ ...current, lastAttemptResult: result }, "correct");
        }
        const attemptsThisAppearance = (surface.attemptsThisAppearance ?? 0) + 1;
        const spent = attemptsThisAppearance >= STUDY_MAX_ATTEMPTS_PER_APPEARANCE
          || (result.attempts_remaining ?? 0) <= 0;
        return {
          ...current,
          lastAttemptResult: result,
          surface: {
            ...surface,
            attemptsThisAppearance,
            heardTranscript: input.transcript,
            phase: "wrong" as const,
            revealReference: spent,
            willReturn: spent && current.exerciseQueue.length > 1,
          },
        };
      });
    }).catch((rejection: StudyingAttemptRejection) => {
      if (isStudyingAuthError(rejection)) {
        props.onAuthRequired();
        return;
      }
      if (isStudyAttemptDivergence(attemptErrorStatus(rejection)) && recoverFromDivergence()) {
        return;
      }
      if (input.type === "translation_choice") {
        updateMultipleChoice(exerciseId, (surface, current) => ({
          ...current,
          surface: {
            ...surface,
            selectedOptionId: undefined,
            submitError: errorMessage(rejection, "Could not record this answer. Try again."),
            submitting: false,
          },
        }));
        return;
      }
      updateSayItBack(exerciseId, (surface, current) => ({
        ...current,
        surface: {
          ...surface,
          phase: "idle" as const,
          submitError: errorMessage(rejection, "Could not check this attempt. Try again."),
        },
      }));
    });
  };

  const submitMultipleChoice = (surface: MultipleChoiceSurfaceState, selectedOptionId: string) => {
    updateMultipleChoice(surface.exercise.id, (latest, current) => ({
      ...current,
      surface: { ...latest, submitError: undefined, submitting: true },
    }));
    submitAttempt({
      attempt_number: surface.attemptNumber,
      exercise_id: surface.exercise.id,
      idempotency_key: attemptIdempotencyKey(surface.exercise.id, surface.attemptNumber),
      selected_option_id: selectedOptionId,
      session_id: props.payload.session_id,
      type: "translation_choice",
    });
  };

  const handlePrimaryAction = () => {
    const surface = lesson().surface;

    if (surface.kind === "multiple_choice") {
      if (surface.result) {
        setLesson((current) => advanceLesson(current, surface.result!));
        return;
      }
      if (surface.selectedOptionId && !surface.submitting) {
        submitMultipleChoice(surface, surface.selectedOptionId);
      }
      return;
    }

    if (surface.kind !== "say_it_back") return;
    const card = surface;

    if (card.phase === "wrong" && card.revealReference) {
      setLesson((current) => advanceLesson(current, "wrong"));
      return;
    }

    if (card.phase === "idle" || (card.phase === "wrong" && !card.revealReference)) {
      // A retryable miss behaves exactly like idle: the footer already reads
      // "Record", so pressing it starts the recording rather than costing the
      // learner an extra tap to clear the banner first.
      const recorder = props.recorder;
      if (!recorder) {
        updateSayItBack(card.exercise.id, (latest, current) => ({
          ...current,
          surface: {
            ...latest,
            phase: "idle" as const,
            submitError: "Voice recording is not available in this browser.",
          },
        }));
        return;
      }
      updateSayItBack(card.exercise.id, (latest, current) => ({
        ...current,
        surface: {
          ...latest,
          heardTranscript: undefined,
          phase: "listening" as const,
          submitError: undefined,
        },
      }));
      void recorder.start().catch((rejection: StudyingAttemptRejection) => {
        updateSayItBack(card.exercise.id, (latest, current) => ({
          ...current,
          surface: {
            ...latest,
            phase: "idle" as const,
            submitError: errorMessage(rejection, "Voice recording is not available in this browser."),
          },
        }));
      });
      return;
    }

    if (card.phase === "listening" && props.recorder) {
      const recorder = props.recorder;
      updateSayItBack(card.exercise.id, (latest, current) => ({
        ...current,
        surface: { ...latest, phase: "checking" as const },
      }));
      void recorder.stop().then(({ transcript }) => {
        submitAttempt({
          attempt_number: card.attemptNumber,
          exercise_id: card.exercise.id,
          idempotency_key: attemptIdempotencyKey(card.exercise.id, card.attemptNumber),
          session_id: props.payload.session_id,
          transcript,
          type: "say_it_back",
        });
      }).catch((rejection: StudyingAttemptRejection) => {
        updateSayItBack(card.exercise.id, (latest, current) => ({
          ...current,
          surface: {
            ...latest,
            phase: "idle" as const,
            submitError: errorMessage(rejection, "Could not check this attempt. Try again."),
          },
        }));
      });
    }
  };

  const handleOptionSelect = (optionId: string) => {
    const surface = lesson().surface;
    if (surface.kind !== "multiple_choice" || surface.result || surface.submitting) return;
    // Selecting an answer submits immediately, matching the legacy flow where
    // the tap unlocks feedback and records the attempt in one gesture.
    updateMultipleChoice(surface.exercise.id, (latest, current) => ({
      ...current,
      surface: { ...latest, selectedOptionId: optionId, submitError: undefined },
    }));
    submitMultipleChoice({ ...surface, selectedOptionId: optionId }, optionId);
  };

  return (
    <>
      <Title>{props.payload.title ? `${props.payload.title} · Study` : "Study"}</Title>
      <StudyingSurface
        lessonProgress={lessonProgressOf(lesson())}
        onExit={props.onExit}
        onKaraoke={props.onKaraoke}
        onOptionSelect={handleOptionSelect}
        onPrimaryAction={handlePrimaryAction}
        onStudyAgain={props.onStudyAgain}
        rewardLabel={props.payload.reward_label}
        state={lesson().surface}
      />
    </>
  );
}

export function StudyingRouteView(props: StudyingRouteViewProps) {
  const [payload, setPayload] = createSignal<StudyingLessonPayload>();
  const [loadError, setLoadError] = createSignal<StudyingAttemptRejection | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [authRequired, setAuthRequired] = createSignal(false);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    void props.client.loadLesson(props.postId)
      .then(setPayload)
      .catch((rejection: StudyingAttemptRejection) => {
        if (isStudyingAuthError(rejection)) setAuthRequired(true);
        setLoadError(rejection);
      })
      .finally(() => setLoading(false));
  };
  if (typeof window !== "undefined") queueMicrotask(load);

  return (
    <Show
      when={!authRequired()}
      fallback={(
        <AuthRequiredRouteState
          ctaLabel="Sign in to study"
          description="Study packs follow the song's community. Sign in to pick up your lesson and streak."
          onConnect={props.onConnect ?? requestSignIn}
          title="Sign in to study"
        />
      )}
    >
      <Show
        when={payload()}
        fallback={(
          <Show
            when={!loading()}
            fallback={<RouteLoadingState height="public" label="Loading study" />}
          >
            <RouteLoadFailureState
              description={errorMessage(loadError(), "We couldn't load this study session.")}
              onGoHome={() => { window.location.href = "/"; }}
              onRetry={load}
              title="Study unavailable"
            />
          </Show>
        )}
      >
        {(loaded) => (
          <Show
            when={!loaded().locked}
            fallback={(
              <StudyingSurface
                onExit={props.onExit}
                onPrimaryAction={props.onExit}
                rewardLabel={loaded().reward_label}
                state={lockedSurface(loaded().price_label)}
              />
            )}
          >
            <LoadedStudyingLesson
              {...props}
              onAuthRequired={() => setAuthRequired(true)}
              onReload={load}
              payload={loaded()}
            />
          </Show>
        )}
      </Show>
    </Show>
  );
}
