import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import type { JSX } from "@solidjs/web";

import {
  Button,
  cn,
  createMediaQuery,
  IconArrowsClockwise,
  IconCheckCircle,
  IconCrown,
  IconFire,
  IconLock,
  IconMicrophone,
  IconSquare,
  IconWarningCircle,
  IconX,
  Spinner,
  Type,
} from "../../design-system";
import { ActivityProgressHeader } from "../activity/activity-progress-header";
import {
  clampPercent,
  previousStreakForAnimation,
  primaryActionDisabled,
  primaryActionLabel,
  primaryActionVariant,
  type StudyingSurfaceState,
} from "./studying-model";

// Solid port of the legacy `SongStudySurface`
// (`web/src/components/compositions/song-study/song-study-surface.tsx`).
// Presentational only: state in, callbacks out. Recording, network, and
// timers live at the route-view seam, never here.

export interface StudyingSurfaceProps {
  class?: string;
  lessonProgress?: {
    resolvedCount: number;
    totalCount: number;
  };
  onExit?: () => void;
  onKaraoke?: () => void;
  onOptionSelect?: (optionId: string) => void;
  onPrimaryAction?: () => void;
  onStudyAgain?: () => void;
  /** Reward pill rendered into the header progress capsule. */
  rewardLabel?: string;
  /** Rich reward content shown below the header on the completion state. */
  rewardSlot?: JSX.Element;
  sayItBackIdleLabel?: string;
  state: StudyingSurfaceState;
}

function ActivityFooter(props: {
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  primaryDisabled?: boolean;
  primaryIcon?: JSX.Element;
  primaryLabel?: string;
  primaryVariant?: "default" | "destructive" | "secondary";
  secondaryIcon?: JSX.Element;
  secondaryLabel?: string;
}) {
  return (
    <Show when={props.primaryLabel}>
      <footer class="sticky bottom-0 z-10 border-t border-border-soft bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 backdrop-blur-xl sm:px-6">
        <div class={cn("mx-auto grid w-full max-w-3xl gap-3", props.secondaryLabel && "sm:grid-cols-2")}>
          <Button
            class="w-full"
            disabled={props.primaryDisabled}
            leadingIcon={props.primaryIcon}
            onClick={props.onPrimaryAction}
            size="lg"
            variant={props.primaryVariant ?? "default"}
          >
            {props.primaryLabel}
          </Button>
          <Show when={props.secondaryLabel}>
            <Button
              class="w-full"
              leadingIcon={props.secondaryIcon}
              onClick={props.onSecondaryAction}
              size="lg"
              variant="secondary"
            >
              {props.secondaryLabel}
            </Button>
          </Show>
        </div>
      </footer>
    </Show>
  );
}

function LockedState(props: { state: Extract<StudyingSurfaceState, { kind: "locked" }> }) {
  return (
    <div class="mx-auto grid w-full max-w-md flex-1 place-items-center px-4 py-10 text-center sm:px-6">
      <div>
        <div class="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-muted text-muted-foreground">
          <IconLock class="size-8" />
        </div>
        <Type as="h2" variant="h2">
          Study unlocks with the song
        </Type>
        <Type as="p" class="mt-2 text-muted-foreground" variant="body">
          Lyrics and translations follow the same access rules as the full track.
        </Type>
        <Show when={props.state.priceLabel}>
          <Type as="p" class="mt-4 text-muted-foreground" variant="caption">
            Full study access is included after purchase.
          </Type>
        </Show>
      </div>
    </div>
  );
}

function SayItBackState(props: { state: Extract<StudyingSurfaceState, { kind: "say_it_back" }> }) {
  return (
    <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-10 sm:px-6">
      <div class="rounded-[var(--radius-2xl)] border border-border-soft bg-card p-6 shadow-sm sm:p-8">
        <div class="mb-5 flex items-center gap-3 text-muted-foreground">
          <IconMicrophone class="size-5" />
          <Type as="span" variant="caption">Say it back</Type>
        </div>
        <Type as="p" class="text-balance text-3xl font-bold leading-tight sm:text-5xl" dir="auto">
          {props.state.exercise.prompt}
        </Type>
      </div>

      {/*
        The prompt above IS the expected answer for say-it-back, so echoing it
        back as "Correct answer:" says nothing the learner cannot already read.
        The only new information is what speech-to-text actually heard, so that
        is what a miss shows. A retryable miss stays muted; only a spent card
        takes the destructive treatment, because red reads as final.
      */}
      <Show when={props.state.phase === "wrong"}>
        <div
          class={cn(
            "rounded-[var(--radius-xl)] border p-4",
            props.state.revealReference
              ? "border-destructive/30 bg-destructive/10"
              : "border-border-soft bg-muted",
          )}
        >
          <div class="flex items-center gap-3">
            <Show
              when={props.state.revealReference}
              fallback={<IconArrowsClockwise class="size-6 shrink-0 text-muted-foreground" />}
            >
              <IconWarningCircle class="size-6 shrink-0 text-destructive-text" />
            </Show>
            <div class="min-w-0">
              <Type
                as="p"
                class={props.state.revealReference ? "text-destructive-text" : "text-muted-foreground"}
                variant="caption"
              >
                {props.state.revealReference
                  ? props.state.willReturn ? "Let's come back to this" : "Let's keep going"
                  : "Not quite — try again"}
              </Type>
              <Show when={props.state.heardTranscript}>
                <Type as="p" class="text-muted-foreground" dir="auto" variant="body">
                  {`Heard: ${props.state.heardTranscript}`}
                </Type>
              </Show>
            </div>
          </div>
        </div>
      </Show>
      <Show when={props.state.submitError}>
        <Type as="p" class="text-destructive-text" role="alert" variant="caption">
          {props.state.submitError}
        </Type>
      </Show>
      <Show when={props.state.guidance}>
        <Type as="p" class="text-muted-foreground" role="status" variant="body">
          {props.state.guidance}
        </Type>
      </Show>
    </div>
  );
}

function MultipleChoiceState(props: {
  onOptionSelect?: (optionId: string) => void;
  state: Extract<StudyingSurfaceState, { kind: "multiple_choice" }>;
}) {
  return (
    <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-10 sm:px-6">
      <div>
        <Type as="p" class="text-muted-foreground" variant="caption">
          {props.state.exercise.question}
        </Type>
        <Type as="h2" class="mt-2 text-balance" dir="auto" variant="h2">
          {props.state.exercise.prompt}
        </Type>
      </div>

      <div class="grid gap-3">
        <For each={props.state.exercise.options}>
          {(option) => {
            const selected = () => option.id === props.state.selectedOptionId;
            const correct = () => option.id === props.state.exercise.correctOptionId;
            const revealCorrect = () => Boolean(props.state.result) && correct();
            const revealWrong = () => props.state.result === "wrong" && selected() && !correct();

            return (
              <button
                class={cn(
                  "flex min-h-16 items-center justify-between gap-4 rounded-[var(--radius-xl)] border border-border-soft bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50",
                  selected() && !props.state.result && "border-foreground/30 bg-muted/70",
                  revealCorrect() && "border-success/40 bg-success/10",
                  revealWrong() && "border-destructive/40 bg-destructive/10",
                )}
                disabled={Boolean(props.state.result) || Boolean(props.state.submitting)}
                onClick={() => props.onOptionSelect?.(option.id)}
                type="button"
              >
                <Type as="span" dir="auto" variant="body-strong">
                  {option.text}
                </Type>
                <Show
                  when={revealCorrect()}
                  fallback={(
                    <Show
                      when={revealWrong()}
                      fallback={(
                        <span class={cn("size-5 shrink-0 rounded-full border", selected() ? "border-foreground bg-foreground" : "border-border")} />
                      )}
                    >
                      <IconX class="size-6 shrink-0 text-destructive-text" />
                    </Show>
                  )}
                >
                  <IconCheckCircle class="size-6 shrink-0 text-success" />
                </Show>
              </button>
            );
          }}
        </For>
      </div>

      <Show when={props.state.submitError}>
        <Type as="p" class="text-destructive-text" role="alert" variant="caption">
          {props.state.submitError}
        </Type>
      </Show>
    </div>
  );
}

function usePrefersReducedMotion(): () => boolean {
  return createMediaQuery("(prefers-reduced-motion: reduce)");
}

function StreakSlotNumber(props: { currentStreak: number; previousStreak: number }) {
  const startDelayMs = 450;
  const prefersReducedMotion = usePrefersReducedMotion();
  const shouldAnimate = () => props.currentStreak > props.previousStreak && !prefersReducedMotion();
  const [advanced, setAdvanced] = createSignal(false);

  createEffect(() => {
    if (!shouldAnimate()) {
      setAdvanced(false);
      return;
    }
    setAdvanced(false);
    const timeout = window.setTimeout(() => setAdvanced(true), startDelayMs);
    onCleanup(() => window.clearTimeout(timeout));
  });

  return (
    <Show
      when={shouldAnimate()}
      fallback={(
        <Type
          aria-label={`${props.currentStreak} day streak`}
          as="h2"
          class="mt-1 text-7xl font-bold leading-none tabular-nums sm:text-8xl"
        >
          {props.currentStreak}
        </Type>
      )}
    >
      <h2
        aria-label={`${props.currentStreak} day streak`}
        class="relative mt-1 h-[0.92em] overflow-hidden text-7xl font-bold leading-none tabular-nums sm:text-8xl"
      >
        <span
          aria-hidden="true"
          class={cn(
            "absolute inset-x-0 top-0 block transition-[transform,opacity] duration-[1200ms] ease-out",
            advanced() ? "translate-y-full opacity-0" : "translate-y-0 opacity-100",
          )}
        >
          {props.previousStreak}
        </span>
        <span
          aria-hidden="true"
          class={cn(
            "absolute inset-x-0 top-0 block transition-[transform,opacity] duration-[1200ms] ease-out",
            advanced() ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0",
          )}
        >
          {props.currentStreak}
        </span>
      </h2>
    </Show>
  );
}

function PerformanceStat(props: { label: string; value: string }) {
  return (
    <div class="rounded-[var(--radius-xl)] bg-muted px-4 py-3 text-center">
      <Type as="p" class="text-xl font-semibold tabular-nums" variant="body-strong">
        {props.value}
      </Type>
      <Type as="p" class="text-muted-foreground" variant="caption">
        {props.label}
      </Type>
    </div>
  );
}

function CompleteState(props: { state: Extract<StudyingSurfaceState, { kind: "complete" }> }) {
  const score = () => clampPercent(props.state.scorePercent);
  const streak = () => props.state.streak;
  const previousStreak = () => previousStreakForAnimation(streak(), props.state.previousStreak);

  return (
    <div class="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-4 py-10 sm:px-6">
      <div class="text-center">
        <div class={cn(
          "mx-auto mb-5 grid size-24 place-items-center rounded-full",
          streak()?.qualifiedToday ? "bg-warning/10 text-warning" : "bg-primary/10 text-primary",
        )}
        >
          <Show
            when={streak()?.qualifiedToday}
            fallback={<IconCrown class="size-14" />}
          >
            <IconFire class="size-14" />
          </Show>
        </div>
        <Type as="p" class="text-lg font-semibold text-muted-foreground" variant="body">
          {streak()?.qualifiedToday ? "Your streak" : "Session complete"}
        </Type>
        <Show
          when={streak()?.qualifiedToday && previousStreak() !== undefined}
          fallback={(
            <Type as="h2" class="mt-1 text-7xl font-bold leading-none sm:text-8xl">
              {`${score()}%`}
            </Type>
          )}
        >
          <StreakSlotNumber currentStreak={streak()!.currentStreak} previousStreak={previousStreak()!} />
          <Type as="p" class="mt-3 font-semibold text-foreground" variant="body">
            {`${score()}% first-pass score`}
          </Type>
        </Show>
      </div>

      <div class="w-full">
        <PerformanceStat label="Correct" value={`${props.state.correctCount}/${props.state.totalCount}`} />
      </div>

      <Show when={props.state.nextReviewLabel}>
        <Type as="p" class="text-center text-muted-foreground" variant="caption">
          {`Next review ${props.state.nextReviewLabel}`}
        </Type>
      </Show>
    </div>
  );
}

function lockedStateOf(state: StudyingSurfaceState) {
  return state.kind === "locked" ? state : undefined;
}
function sayItBackStateOf(state: StudyingSurfaceState) {
  return state.kind === "say_it_back" ? state : undefined;
}
function multipleChoiceStateOf(state: StudyingSurfaceState) {
  return state.kind === "multiple_choice" ? state : undefined;
}
function completeStateOf(state: StudyingSurfaceState) {
  return state.kind === "complete" ? state : undefined;
}

function Body(props: {
  onOptionSelect?: (optionId: string) => void;
  state: StudyingSurfaceState;
}) {
  return (
    <>
      <Show when={lockedStateOf(props.state)}>
        {(state) => <LockedState state={state()} />}
      </Show>
      <Show when={sayItBackStateOf(props.state)}>
        {(state) => <SayItBackState state={state()} />}
      </Show>
      <Show when={multipleChoiceStateOf(props.state)}>
        {(state) => (
          <MultipleChoiceState
            onOptionSelect={props.onOptionSelect}
            state={state()}
          />
        )}
      </Show>
      <Show when={completeStateOf(props.state)}>
        {(state) => <CompleteState state={state()} />}
      </Show>
    </>
  );
}

function primaryActionIcon(state: StudyingSurfaceState): JSX.Element {
  if (state.kind !== "say_it_back") return undefined;
  if (state.phase === "checking") return <Spinner class="size-5" />;
  if (state.phase === "listening") return <IconSquare class="size-5" />;
  if (state.phase === "idle" || (state.phase === "wrong" && !state.revealReference)) {
    return <IconMicrophone class="size-5" />;
  }
  return undefined;
}

export function StudyingSurface(props: StudyingSurfaceProps) {
  const complete = () => props.state.kind === "complete";
  const primaryLabel = () => complete()
    ? props.onStudyAgain
      ? "Study again"
      : props.onKaraoke
        ? "Karaoke"
        : undefined
    : primaryActionLabel(props.state, props.sayItBackIdleLabel);
  const primaryAction = () => complete() ? props.onStudyAgain ?? props.onKaraoke : props.onPrimaryAction;
  const primaryIcon = () => complete()
    ? props.onStudyAgain
      ? <IconCheckCircle class="size-5" />
      : props.onKaraoke
        ? <IconMicrophone class="size-5" />
        : undefined
    : primaryActionIcon(props.state);
  const secondaryLabel = () => complete() && props.onStudyAgain && props.onKaraoke ? "Karaoke" : undefined;

  return (
    <section class={cn("flex h-dvh w-full flex-col overflow-y-auto bg-background text-foreground", props.class)}>
      <ActivityProgressHeader
        exitLabel="Exit study"
        onExit={props.onExit}
        progressMax={Math.max(0, props.lessonProgress?.totalCount ?? 0)}
        progressValue={Math.max(0, Math.min(props.lessonProgress?.totalCount ?? 0, props.lessonProgress?.resolvedCount ?? 0))}
        rewardLabel={complete() ? undefined : props.rewardLabel}
      />
      <Show when={complete() && props.rewardSlot}>
        <div class="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
          {props.rewardSlot}
        </div>
      </Show>
      <Body onOptionSelect={props.onOptionSelect} state={props.state} />
      <ActivityFooter
        onPrimaryAction={primaryAction()}
        onSecondaryAction={props.onKaraoke}
        primaryDisabled={primaryActionDisabled(props.state)}
        primaryIcon={primaryIcon()}
        primaryLabel={primaryLabel()}
        primaryVariant={primaryActionVariant(props.state)}
        secondaryIcon={<IconMicrophone class="size-5" />}
        secondaryLabel={secondaryLabel()}
      />
    </section>
  );
}
