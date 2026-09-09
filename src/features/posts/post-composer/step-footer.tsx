// Step navigation footer: desktop CardFooter and mobile fixed bar. Rendered
// only for multi-step tracks (song). Single-step tracks post from the
// composer button instead. Back navigates within the per-track step list; the
// final step publishes exactly once through the host's submit runtime.

import { Portal } from "@solidjs/web";
import { createEffect, createSignal, For, Show } from "solid-js";

import { Button, CardFooter } from "../../../design-system";
import { cn } from "../../../design-system";
import type { ComposerSteps } from "./composer-steps";
import { animateComposerBarEnter } from "./composer-motion";
import type { PostComposerController } from "./controller";
import { songTermsIssue } from "./song-steps";
import { PublishButton } from "./submit-actions";
import { getNextComposerStep, getPreviousComposerStep } from "./utils";
import type { SongFlowRuntime } from "./types";

// Step indicator for the song flow: position and names, with names clickable
// once the first step (Song) is satisfied, since no later step is a hard gate.
export function PostComposerStepIndicator(props: {
  controller: PostComposerController;
  steps: ComposerSteps;
}) {
  const controller = props.controller;
  const canJump = () => !controller.requirements.songAudioMissing;
  const stepName = (step: string) =>
    step === "lyrics" ? controller.copy.steps.lyrics
      : step === "rights" ? controller.copy.steps.rights
        : step === "review" ? controller.copy.steps.review
          : controller.copy.steps.song;

  return (
    <nav aria-label="Steps" class="flex flex-wrap items-center gap-x-1 gap-y-1">
      <For each={props.steps.list()}>
        {(step, index) => {
          const isCurrent = () => step === props.steps.current();
          const clickable = () => canJump() || isCurrent();
          return (
            <>
              <Show when={index() > 0}>
                <span class="select-none text-muted-foreground" aria-hidden="true">·</span>
              </Show>
              <button
                aria-current={isCurrent() ? "step" : undefined}
                class={cn(
                  "rounded-full px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  controller.isMobile() ? "text-base" : "text-lg",
                  isCurrent() ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                  !clickable() && "cursor-default opacity-60 hover:text-muted-foreground",
                )}
                disabled={!clickable()}
                onClick={() => props.steps.set(step)}
                type="button"
              >
                {stepName(step)}
              </button>
            </>
          );
        }}
      </For>
    </nav>
  );
}

export function PostComposerStepFooter(props: {
  controller: PostComposerController;
  steps: ComposerSteps;
  runtime?: SongFlowRuntime;
}) {
  const controller = props.controller;
  const [preparing, setPreparing] = createSignal(false);
  let mobileBar: HTMLDivElement | undefined;
  let entered = false;
  createEffect(
    () => mobileBar,
    (nextBar) => {
      if (!entered && nextBar) {
        animateComposerBarEnter(nextBar);
        entered = true;
      }
    },
  );
  const tab = () => controller.tabs.activeTab;
  const locked = () => props.runtime?.locked === true;
  const termsIssue = () => songTermsIssue(controller, props.runtime);

  const canAdvance = () => {
    if (preparing() || locked() || controller.submit.loading) return false;
    switch (props.steps.current()) {
      case "song":
        return !controller.requirements.songAudioMissing
          && Boolean(controller.song.state.title?.trim())
          && !(props.runtime && !props.runtime.personaId);
      case "lyrics":
        return props.runtime ? props.runtime.prepared : true;
      case "rights":
        return termsIssue() === "";
      default:
        return true;
    }
  };

  const nextLabel = () => {
    const next = getNextComposerStep(props.steps.current(), tab());
    if (props.steps.current() === "song" && props.runtime && !props.runtime.prepared) {
      return "Upload and continue";
    }
    if (next === "rights") return controller.copy.actions.continue;
    if (next === "review") return controller.copy.steps.review;
    return controller.copy.actions.continue;
  };

  const goBack = () => {
    props.steps.set(getPreviousComposerStep(props.steps.current(), tab()));
  };
  const goNext = async () => {
    if (!canAdvance()) return;
    const target = getNextComposerStep(props.steps.current(), tab());
    if (props.steps.current() === "song" && props.runtime && !props.runtime.prepared) {
      // Advancing past Song uploads the audio first; a failed or uncertain
      // upload stays on this step with the host's error surfaced. The target
      // is computed before the await because a successful upload re-seeds the
      // step state, which would otherwise advance a second time.
      setPreparing(true);
      try {
        if (!await props.runtime.prepare()) return;
      } catch {
        return;
      } finally {
        setPreparing(false);
      }
    }
    props.steps.set(target);
  };

  const back = () => (
    <Show when={!props.steps.isFirst()} fallback={<span aria-hidden="true" />}>
      <Button disabled={preparing() || controller.submit.loading} onClick={goBack} size="lg" variant="outline">
        {controller.copy.actions.back}
      </Button>
    </Show>
  );
  const forward = () => (
    <Show
      when={props.steps.isLast()}
      fallback={
        <Button class={controller.isMobile() ? "w-full" : undefined} disabled={!canAdvance()} loading={preparing()} onClick={() => void goNext()} size="lg">
          {nextLabel()}
        </Button>
      }
    >
      <PublishButton
        class={controller.isMobile() ? "h-12 w-full" : undefined}
        controller={controller}
        label={controller.submit.label}
        onClick={controller.submit.onSubmit}
        size="lg"
      />
    </Show>
  );

  const desktop = (
    <CardFooter class="justify-between gap-3 border-t border-border-soft px-8 py-5">
      {back()}
      {forward()}
    </CardFooter>
  );

  const mobile = (
    <div class="fixed inset-x-0 bottom-0 z-20 border-t border-border-soft bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-xl" ref={mobileBar}>
      <div class="flex items-center gap-3">
        {back()}
        <div class="min-w-0 flex-1">{forward()}</div>
      </div>
    </div>
  );

  if (controller.isMobile()) {
    if (typeof document === "undefined") return mobile;
    return <Portal>{mobile}</Portal>;
  }

  return desktop;
}
