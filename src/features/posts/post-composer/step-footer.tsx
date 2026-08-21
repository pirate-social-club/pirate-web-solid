// Step navigation footer: desktop CardFooter and mobile fixed bar. Rendered
// only for multi-step tracks (song, video). Single-step tracks post from the
// header button instead. Back navigates within the per-track step list; the
// final step posts.

import { Portal } from "@solidjs/web";
import { Show } from "solid-js";

import { Button, CardFooter, FormNote } from "../../../design-system";
import type { PostComposerController } from "./controller";
import { getNextComposerStep, getPreviousComposerStep } from "./utils";

export function PostComposerStepFooter(props: {
  controller: PostComposerController;
}) {
  const controller = props.controller;
  const isFirst = () => controller.step.isFirst;
  const isLast = () => controller.step.isLast;
  const tab = () => controller.tabs.activeTab;

  const canAdvance = () => {
    if (controller.step.current === "track") {
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
          {controller.copy.actions.continue}
        </Button>
      }
    >
      <Button disabled={controller.submit.disabled} onClick={post} size="lg">
        {controller.copy.actions.post}
      </Button>
    </Show>
  );

  const desktop = (
    <CardFooter class="justify-between gap-3 border-t border-border-soft p-5">
      {back()}
      {forward()}
    </CardFooter>
  );

  const mobile = (
    <div class="fixed inset-x-0 bottom-0 z-20 border-t border-border-soft bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-xl">
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
