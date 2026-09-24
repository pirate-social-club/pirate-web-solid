// Step navigation footer: desktop CardFooter and mobile fixed bar. Rendered
// only for multi-step tracks (song). Single-step tracks post from the
// composer button instead. Back navigates within the per-track step list; the
// final step publishes exactly once through the host's submit runtime.

import { Portal } from "@solidjs/web";
import { createEffect, createSignal, Show } from "solid-js";

import { Button, CardFooter, FormNote, IconArrowLeft, IconArrowRight, IconArrowUp, IconButton, IconX } from "../../../design-system";
import { cn } from "../../../design-system";
import type { ComposerSteps } from "./composer-steps";
import { animateComposerBarEnter } from "./composer-motion";
import type { PostComposerController } from "./controller";
import { songTermsIssue } from "./song-steps";
import { PublishButton } from "./submit-actions";
import { getNextComposerStep, getPreviousComposerStep } from "./utils";
import type { SongFlowRuntime } from "./types";

export function PostComposerStepFooter(props: {
  /** Mobile header navigation: close or back on the left, the step name in
   * the middle, and the forward or publish action on the right. */
  layout?: "footer" | "header";
  onClose?: () => void;
  controller: PostComposerController;
  /** Where the mobile footer belongs. Same rule as the attachment bar: a host
   * that already owns the viewport gets `inline`, because a portalled footer
   * leaves that host's stacking context and lands behind its overlay, taking
   * Back, Next and Publish out of reach. */
  placement?: "fixed" | "inline";
  steps: ComposerSteps;
  runtime?: SongFlowRuntime;
}) {
  const controller = props.controller;
  const placement = () => props.placement ?? "fixed";
  const [preparing, setPreparing] = createSignal(false);
  let advancing = false;
  let mobileBar: HTMLDivElement | undefined;
  let entered = false;
  createEffect(
    () => mobileBar,
    (nextBar) => {
      // The entrance slide belongs to a bar that floats in from the bottom
      // edge. An inline footer is already in the flow, so it just appears.
      if (!entered && nextBar && placement() === "fixed") {
        animateComposerBarEnter(nextBar);
        entered = true;
      }
    },
  );
  const locked = () => props.runtime?.locked === true;
  const termsIssue = () => songTermsIssue(controller, props.runtime);

  const canAdvance = () => {
    if (preparing() || locked() || controller.submit.loading) return false;
    switch (props.steps.current()) {
      case "song":
        return (!controller.requirements.songAudioMissing || props.runtime?.prepared === true)
          && Boolean(controller.song.state.title?.trim())
          && !(props.runtime && !props.runtime.personaId);
      case "rights":
        return termsIssue() === "";
      default:
        return true;
    }
  };

  const goBack = () => {
    props.steps.set(getPreviousComposerStep(props.steps.current(), controller.tabs.activeTab));
  };
  const goNext = async () => {
    // Signal writes are not visible to a second handler in the same tick.
    // This synchronous owner prevents a double click from starting a second
    // advance while the audio preparation is still awaiting its response.
    if (advancing) return;
    advancing = true;
    const target = getNextComposerStep(props.steps.current(), controller.tabs.activeTab);
    try {
      if (props.steps.current() === "song" && props.runtime && !props.runtime.prepared) {
        // Advancing past Song uploads the audio first; a failed or uncertain
        // upload stays on this step with the host's error surfaced. The target
        // is computed before the await because a successful upload re-seeds the
        // step state, which would otherwise advance a second time.
        setPreparing(true);
        if (!await props.runtime.prepare()) return;
      }
    } catch {
      return;
    } finally {
      advancing = false;
      setPreparing(false);
    }
    // Release the operation before exposing the next step. An author can
    // legitimately continue as soon as that UI becomes visible.
    props.steps.set(target);
  };

  const back = () => (
    <Show when={!props.steps.isFirst() && !locked()} fallback={<span aria-hidden="true" />}>
      <Button disabled={preparing() || controller.submit.loading} onClick={goBack} size="lg" variant="outline">
        {controller.copy.actions.back}
      </Button>
    </Show>
  );
  const forward = () => (
    <Show
      when={props.steps.isLast()}
      fallback={
        <Button
          class={controller.isMobile() ? "w-full" : undefined}
          data-composer-forward
          disabled={!canAdvance()}
          loading={preparing()}
          onClick={() => void goNext()}
          size="lg"
        >
          {controller.copy.actions.continue}
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

  // The final step's PublishButton renders the submit error beside itself.
  // Earlier steps have no such button, so an audio upload that fails on
  // Continue would otherwise leave the author on Song with no explanation.
  const stepError = (className?: string) => (
    <Show when={!props.steps.isLast() && controller.submit.error}>
      {(message) => (
        <div aria-live="polite" class={className} role="alert">
          <FormNote tone="warning">{message()}</FormNote>
        </div>
      )}
    </Show>
  );

  const desktop = (
    <CardFooter class="justify-between gap-3 border-t border-border-soft px-8 py-5">
      {back()}
      <div class="flex min-w-0 flex-1 items-center justify-end gap-3">
        {stepError()}
        {forward()}
      </div>
    </CardFooter>
  );

  const mobile = (
    <div
      class={cn(
        "border-t border-border-soft bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur-xl",
        placement() === "inline" ? "w-full" : "fixed inset-x-0 bottom-0 z-20",
      )}
      ref={mobileBar}
    >
      {stepError("mb-3")}
      <div class="flex items-center gap-3">
        {back()}
        <div class="min-w-0 flex-1">{forward()}</div>
      </div>
    </div>
  );

  if (controller.isMobile() && props.layout === "header") {
    // Two equal icon buttons: close or back on the left, forward or publish
    // on the right. The step needs no title; the form says what it is.
    const headerForward = () => (
      <Show
        when={props.steps.isLast()}
        fallback={
          <IconButton
            aria-label={controller.copy.actions.continue}
            data-composer-forward
            disabled={!canAdvance()}
            loading={preparing()}
            onClick={() => void goNext()}
            variant="default"
          >
            <IconArrowRight class="size-5" />
          </IconButton>
        }
      >
        <IconButton
          aria-label={controller.submit.label}
          disabled={controller.submit.disabled || controller.submit.progress?.phase === "done"}
          loading={controller.submit.loading}
          onClick={() => controller.submit.onSubmit?.()}
          variant="default"
        >
          <IconArrowUp class="size-5" />
        </IconButton>
      </Show>
    );
    const headerError = () => (
      <Show when={controller.submit.error}>
        {(message) => (
          <div aria-live="polite" class="px-1 pb-2" role="alert">
            <FormNote tone="warning">{message()}</FormNote>
          </div>
        )}
      </Show>
    );
    return (
      <div>
        <header class="flex min-h-14 items-center justify-between px-1">
          <Show
            when={!props.steps.isFirst() && !locked()}
            fallback={
              <IconButton aria-label="Close composer" onClick={() => props.onClose?.()} variant="ghost">
                <IconX class="size-5" />
              </IconButton>
            }
          >
            <IconButton aria-label={controller.copy.actions.back} disabled={preparing() || controller.submit.loading} onClick={goBack} variant="ghost">
              <IconArrowLeft class="size-5" />
            </IconButton>
          </Show>
          {headerForward()}
        </header>
        {headerError()}
      </div>
    );
  }
  if (controller.isMobile()) {
    if (placement() === "inline" || typeof document === "undefined") return mobile;
    return <Portal>{mobile}</Portal>;
  }

  return desktop;
}
