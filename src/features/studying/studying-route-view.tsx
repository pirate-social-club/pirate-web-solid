import { createSignal, onCleanup, Show } from "solid-js";
import { Title } from "@solidjs/meta";
import { preloadGlobalSignInAssets, prepareGlobalSignIn, requestGlobalSignIn } from "../auth/global-sign-in-host";
import { Button, Type } from "../../design-system";

import {
  applyServerLesson,
  completeSurface,
  exerciseSurface,
  isStudyAttemptDivergence,
  lockedSurface,
  makeAttemptIdempotencyKey,
  STUDY_ATTEMPT_DIVERGENCE_RECOVERY_LIMIT,
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
import {
  StudyAuthRequiredState,
  StudyRouteLoadFailureState,
  StudyRouteLoadingState,
} from "./studying-route-states";
import {
  playStudyFeedbackSound,
  preloadStudyFeedbackSounds,
  unlockStudyFeedbackAudio,
} from "./studying-feedback-audio";

// Route-level view for the studying activity. All effectful work (payload
// load, attempt submission, mic capture, the multiple-choice auto-advance
// delay) is injected; the view only sequences the surface state machine.
// Mirrors the legacy `study-route.tsx` controller minus Telegram handoff.

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

function LoadedStudyingLesson(props: StudyingRouteViewProps & {
  onAuthRequired: () => void;
  onReload: () => void;
  payload: StudyingLessonPayload;
}) {
  const [lesson, setLesson] = createSignal<StudyingLessonState>({
    correctCount: props.payload.correct_count ?? 0,
    exercises: props.payload.exercises,
    previousStreak: props.payload.previous_streak,
    resolvedCount: props.payload.resolved_count,
    servedCount: props.payload.served_count,
    surface: props.payload.exercises.length > 0
      ? exerciseSurface(props.payload.exercises[0]!)
      : completeSurface({
          correctCount: props.payload.correct_count ?? 0,
          totalCount: props.payload.served_count ?? 0,
        }),
  });
  let divergenceRecoveries = 0;
  const idempotencyKeys = new Map<string, string>();
  const [micDisclosure, setMicDisclosure] = createSignal<string | null>(null);

  // Spec 019 §5.1: learner-facing microphone capture requires a first-use
  // disclosure naming the provider and its retention before the first
  // capture. The acknowledgment is a local UI fact, not an account fact.
  const MIC_DISCLOSURE_STORAGE_KEY = "study:microphone-disclosure:v1";

  const micDisclosureAcknowledged = (): boolean => {
    try {
      return globalThis.localStorage?.getItem(MIC_DISCLOSURE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  };

  const acknowledgeMicDisclosure = () => {
    const pending = micDisclosure();
    try {
      globalThis.localStorage?.setItem(MIC_DISCLOSURE_STORAGE_KEY, "1");
    } catch {
      // Storage can be unavailable (private mode); the disclosure simply
      // reappears next session, which is the safe direction.
    }
    setMicDisclosure(null);
    const surface = lesson().surface;
    if (pending !== null && surface.kind === "say_it_back" && surface.exercise.id === pending) {
      beginCapture(surface);
    }
  };

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
      if (result.outcome) {
        playStudyFeedbackSound(result.outcome === "correct" ? "correct" : "incorrect");
      }
      if (input.type === "translation_choice") {
        updateMultipleChoice(exerciseId, (surface, current) => {
          if (result.outcome === "correct") {
            // The green highlight stays on the selected option briefly, then
            // the lesson moves to the server's next card without a "correct"
            // banner.
            (props.scheduleAdvance ?? defaultScheduleAdvance)(() => {
              updateMultipleChoice(exerciseId, (latest, state) => latest.result === "correct"
                ? applyServerLesson(state, result)
                : state);
            });
          }
          // A retryable miss keeps the server-selected current card — the same
          // item at its next attempt number; only its queue ordinal moved.
          const retryExercise = result.next_lesson?.exercises[0];
          const retryable = result.outcome === "incorrect" && (result.attempts_remaining ?? 0) > 0
            && retryExercise?.id === exerciseId;
          return {
            ...current,
            lastAttemptResult: result,
            surface: {
              ...surface,
              exercise: {
                ...surface.exercise,
                correctOptionId: result.correct_option_id ?? surface.exercise.correctOptionId,
              },
              attemptNumber: retryable
                ? Number(retryExercise?.presentation_count ?? surface.attemptNumber - 1) + 1
                : surface.attemptNumber,
              canRetry: retryable,
              result: result.outcome === "correct" ? "correct" as const : "wrong" as const,
              submitting: false,
            },
          };
        });
        return;
      }
      updateSayItBack(exerciseId, (surface, current) => {
        if (result.outcome === "correct") {
          return applyServerLesson(current, result);
        }
        // Every graded spoken presentation is spent server-side: the miss is
        // final for this appearance, the diff explains it, and an unresolved
        // card returns later in the lesson at the server's choosing.
        const resolved = result.next_lesson?.resolved_count ?? current.resolvedCount ?? 0;
        const total = current.servedCount ?? current.exercises.length;
        return {
          ...current,
          lastAttemptResult: result,
          surface: {
            ...surface,
            diff: result.diff,
            heardTranscript: result.heard_transcript,
            phase: "wrong" as const,
            revealReference: true,
            willReturn: resolved < total,
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

  const beginCapture = (card: SayItBackSurfaceState) => {
    unlockStudyFeedbackAudio();
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
        diff: undefined,
        heardTranscript: undefined,
        phase: "listening" as const,
        submitError: undefined,
        willReturn: undefined,
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
  };

  const handlePrimaryAction = () => {
    const surface = lesson().surface;
    if (surface.kind === "multiple_choice") {
      if (surface.result) {
        if (surface.result === "wrong" && surface.canRetry) {
          updateMultipleChoice(surface.exercise.id, (latest, current) => ({
            ...current,
            surface: {
              ...latest,
              canRetry: false,
              result: undefined,
              selectedOptionId: undefined,
            },
          }));
          return;
        }
        setLesson((current) => applyServerLesson(current, current.lastAttemptResult ?? {}));
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
      // The spent miss is final for this appearance: continue to the
      // server's next card (or completion) from the stored server lesson.
      setLesson((current) => applyServerLesson(current, current.lastAttemptResult ?? {}));
      return;
    }

    if (card.phase === "idle" || (card.phase === "wrong" && !card.revealReference)) {
      // A retryable miss behaves exactly like idle: the footer already reads
      // "Record", so pressing it starts the recording rather than costing the
      // learner an extra tap to clear the banner first.
      if (!micDisclosureAcknowledged()) {
        setMicDisclosure(card.exercise.id);
        return;
      }
      beginCapture(card);
      return;
    }

    if (card.phase === "listening" && props.recorder) {
      const recorder = props.recorder;
      updateSayItBack(card.exercise.id, (latest, current) => ({
        ...current,
        surface: { ...latest, phase: "checking" as const },
      }));
      void recorder.stop().then(({ audio, contentType, durationMs }) => {
        submitAttempt({
          audio,
          audio_duration_ms: durationMs,
          attempt_number: card.attemptNumber,
          content_type: contentType,
          exercise_id: card.exercise.id,
          idempotency_key: attemptIdempotencyKey(card.exercise.id, card.attemptNumber),
          session_id: props.payload.session_id,
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
    unlockStudyFeedbackAudio();
    updateMultipleChoice(surface.exercise.id, (latest, current) => ({
      ...current,
      surface: { ...latest, selectedOptionId: optionId, submitError: undefined },
    }));
    submitMultipleChoice({ ...surface, selectedOptionId: optionId }, optionId);
  };

  // Capture cannot outlive this surface: disposal stops any live recording
  // and invalidates permission still being granted.
  onCleanup(() => {
    void props.recorder?.cancel?.();
  });

  return (
    <>
      <Title>{props.payload.title ? `${props.payload.title} · Study` : "Study"}</Title>
      <Show when={micDisclosure() !== null}>
        <div
          class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          data-study-mic-disclosure
          role="dialog"
          aria-modal="true"
          aria-label="Recording disclosure"
        >
          <div class="w-full max-w-md rounded-[var(--radius-xl)] border border-border bg-card p-6 shadow-xl">
            <Type as="h2" variant="h3">Before you record</Type>
            <Type as="p" class="mt-3 text-muted-foreground" variant="body">
              Your voice recording is sent to our speech provider, ElevenLabs,
              for transcription. Under its standard terms, ElevenLabs may retain
              the recording. Pirate also stores your recording privately for 24
              months for your study review history, and you can delete it from
              Settings at any time.
            </Type>
            <div class="mt-6 flex gap-3">
              <Button
                class="flex-1"
                onClick={() => setMicDisclosure(null)}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                class="flex-1"
                data-study-mic-disclosure-accept
                onClick={acknowledgeMicDisclosure}
              >
                Continue to record
              </Button>
            </div>
          </div>
        </div>
      </Show>
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
      .then((next) => {
        if (!next.locked && next.exercises.length > 0) preloadStudyFeedbackSounds();
        setPayload(next);
      })
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
        <StudyAuthRequiredState
          ctaLabel="Sign in"
          description="Study packs follow the song's community. Sign in to pick up your lesson and streak."
          onConnect={props.onConnect ?? requestGlobalSignIn}
          onConnectIntent={props.onConnect === undefined ? prepareGlobalSignIn : undefined}
          onConnectPreload={props.onConnect === undefined ? preloadGlobalSignInAssets : undefined}
          onExit={props.onExit}
          title="Sign in to study"
        />
      )}
    >
      <Show
        when={payload()}
        fallback={(
          <Show
            when={!loading()}
            fallback={<StudyRouteLoadingState label="Loading study" />}
          >
            <StudyRouteLoadFailureState
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
