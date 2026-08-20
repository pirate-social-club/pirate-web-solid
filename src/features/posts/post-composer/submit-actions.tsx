// Submit footer (desktop) + fixed submit bar (mobile), ported from the React
// post-composer-submit-actions.tsx. The DS Button has no `loadingIndicator`
// slot, so the determinate progress ring renders as a leadingIcon and the
// loading spinner path is bypassed; behavior matches React.

import { Show } from "solid-js";

import {
  Button,
  FormNote,
  IconArrowUp,
} from "../../../design-system";
import type { PostComposerController } from "./controller";
import { submitProgressFraction } from "./submit-progress";
import type { SubmitProgress } from "./types";

// Determinate progress ring rendered inside the publish button in place of the
// indeterminate Spinner while a submit runs. Same geometry as Spinner (24
// viewBox, r=9, stroke 3) so the swap is visually seamless; the arc sweeps from
// 12 o'clock by submitProgressFraction. A small floor keeps it from looking
// empty at the start.
function SubmitProgressRing(props: {
  progress: SubmitProgress;
}) {
  const fraction = () => submitProgressFraction(props.progress);
  const visualFraction = () => Math.max(0.04, Math.min(1, fraction()));
  const radius = 9;
  const circumference = 2 * Math.PI * radius;

  return (
    <span aria-hidden="true" class="inline-flex">
      <svg aria-hidden="true" class="size-5 -rotate-90" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" opacity="0.25" r={radius} stroke="currentColor" stroke-width="3" />
        <circle
          class="transition-[stroke-dashoffset] duration-300 ease-out"
          cx="12"
          cy="12"
          r={radius}
          stroke="currentColor"
          stroke-dasharray={String(circumference)}
          stroke-dashoffset={String(circumference * (1 - visualFraction()))}
          stroke-linecap="round"
          stroke-width="3"
        />
      </svg>
    </span>
  );
}

function SubmitProgressStatus(props: {
  progress: SubmitProgress | null | undefined;
}) {
  return (
    <Show when={props.progress && props.progress.phase !== "done" ? props.progress : null}>
      {(progress) => (
        <span
          aria-label={progress().label}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(submitProgressFraction(progress()) * 100)}
          class="sr-only"
          role="progressbar"
        />
      )}
    </Show>
  );
}

// A single constant label carries the button through the whole submit — users
// don't care which internal stage is running; the progress bar conveys
// movement. A constant label also keeps the button width stable.
function submitButtonContent(progress: SubmitProgress | null | undefined, fallback: string): string {
  if (!progress) return fallback;
  if (progress.phase === "done") return progress.label;
  return "Posting...";
}

export function PublishButton(props: {
  compact?: boolean;
  controller: PostComposerController;
  class?: string;
  label?: string;
  onClick?: () => void;
}) {
  const controller = props.controller;
  const submit = controller.submit;
  const publishLabel = () => props.label
    ?? (controller.tabs.activeTab === "live" ? submit.label : controller.copy.actions.publish);
  const showRing = () => Boolean(submit.loading && submit.progress && submit.progress.phase !== "done");
  const compact = () => props.compact === true;
  const buttonLabel = () => submitButtonContent(submit.loading ? submit.progress : null, publishLabel());

  return (
    <div class="flex min-w-0 flex-1 items-center justify-end gap-3 lg:ms-auto">
      <Show when={submit.error}>
        <FormNote tone="warning">{submit.error}</FormNote>
      </Show>
      <SubmitProgressStatus progress={submit.progress} />
      <Button
        aria-label={compact() ? buttonLabel() : undefined}
        class={compact() ? "size-11 p-0" : props.class ?? "min-w-40 justify-center"}
        disabled={submit.disabled || submit.progress?.phase === "done"}
        leadingIcon={showRing() ? <SubmitProgressRing progress={submit.progress!} /> : compact() ? <IconArrowUp class="size-5" /> : undefined}
        loading={submit.loading && !submit.progress}
        onClick={() => (props.onClick ?? submit.onSubmit)?.()}
        size={compact() ? "icon" : "lg"}
      >
        <Show when={compact()} fallback={buttonLabel()}>
          <span class="sr-only">{buttonLabel()}</span>
        </Show>
      </Button>
    </div>
  );
}
