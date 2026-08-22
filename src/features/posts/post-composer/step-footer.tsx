// Step navigation footer: desktop CardFooter and mobile fixed bar. Rendered
// only for multi-step tracks (song, video). Single-step tracks post from the
// header button instead. Back navigates within the per-track step list; the
// final step posts.

import { Portal } from "@solidjs/web";
import { For, Show, createEffect } from "solid-js";

import { Button, CardFooter, FormNote } from "../../../design-system";
import { cn } from "../../../design-system";
import type { PostComposerController } from "./controller";
import { animateComposerBarEnter } from "./composer-motion";
import { getNextComposerStep, getPreviousComposerStep } from "./utils";

// Step indicator for the song flow: position and names, with names clickable
// once the first step (Song) is satisfied, since no later step is a hard gate.
export function PostComposerStepIndicator(props: {
  controller: PostComposerController;
}) {
  const controller = props.controller;
  const canJump = () => !controller.requirements.songAudioMissing;

  return (
    <nav aria-label="Steps" class="flex flex-wrap items-center gap-x-1 gap-y-1">
      <For each={controller.step.list}>
        {(step, index) => {
          const isCurrent = () => step === controller.step.current;
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
                onClick={() => controller.step.set(step)}
                type="button"
              >
                {controller.copy.steps[step] ?? step}
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
}) {
  const controller = props.controller;
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
  const isFirst = () => controller.step.isFirst;
  const isLast = () => controller.step.isLast;
  const tab = () => controller.tabs.activeTab;

  const canAdvance = () => {
    if (controller.step.current === "song") {
      return !controller.requirements.songAudioMissing;
    }
    return true;
  };

  const goBack = () => {
    const previous = getPreviousComposerStep(controller.step.current, tab());
    if (previous) controller.step.set(previous);
  };
  const goNext = () => {
    controller.step.set(getNextComposerStep(controller.step.current, tab()));
  };
  const post = () => controller.submit.onSubmit?.();

  const back = () => (
    <Show when={!isFirst()} fallback={<span aria-hidden="true" />}>
      <Button onClick={goBack} size="lg" variant="outline">
        {controller.copy.actions.back}
      </Button>
    </Show>
  );
  const forward = () => (
    <Show
      when={isLast()}
      fallback={
        <Button disabled={!canAdvance()} onClick={goNext} size="lg">
          {controller.copy.actions.nextTo(
            controller.copy.steps[getNextComposerStep(controller.step.current, tab())]
              ?? getNextComposerStep(controller.step.current, tab()),
          )}
        </Button>
      }
    >
      <Button disabled={controller.submit.disabled} onClick={post} size="lg">
        {controller.copy.actions.post}
      </Button>
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
      <Show when={controller.submit.error}>
        <FormNote class="pt-2" tone="warning">{controller.submit.error}</FormNote>
      </Show>
    </div>
  );

  if (controller.isMobile()) {
    if (typeof document === "undefined") return mobile;
    return <Portal>{mobile}</Portal>;
  }

  return desktop;
}
