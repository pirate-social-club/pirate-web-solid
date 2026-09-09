import { createSignal, Show } from "solid-js";

import { Card, IconButton, IconX, createIsMobile, cn } from "../../../design-system";
import { createComposerSteps } from "./composer-steps";
import { PostComposerRequiredSheet } from "./required-post-sheet";
import { PublishButton } from "./submit-actions";
import { createPostComposerController } from "./controller";
import { SongStep } from "./song-step";
import { SongLyricsStep, SongReviewStep, SongRightsStep } from "./song-steps";
import { PostComposerStepFooter, PostComposerStepIndicator } from "./step-footer";
import type { PostComposerProps } from "./types";
import { PostComposerWriteStep } from "./write-step";

export function PostComposer(props: PostComposerProps) {
  const controller = createPostComposerController(props, { isMobile: createIsMobile() });
  const steps = createComposerSteps(() => controller.tabs.activeTab, () => props.initialSongStep);
  const [requiredSheetOpen, setRequiredSheetOpen] = createSignal(false);
  const isMultiStep = () => steps.list().length > 1;

  const requestPost = () => {
    if (controller.requirements.requiresPostSheet) {
      setRequiredSheetOpen(true);
      return;
    }
    controller.submit.onSubmit?.();
  };

  const stepContent = () => {
    if (!isMultiStep()) {
      return (
        <>
          <PostComposerWriteStep
            onVideoEntry={props.onVideoEntry}
            controller={controller}
            initialOpenPanel={props.initialOpenPanel}
          >
            <PublishButton
              class="min-w-40"
              controller={controller}
              label={controller.submit.label}
              onClick={requestPost}
            />
          </PostComposerWriteStep>
          <Show when={props.textOutcome}>{props.textOutcome!()}</Show>
        </>
      );
    }
    switch (steps.current()) {
      case "song":
        return <SongStep controller={controller} runtime={props.songFlowRuntime} />;
      case "lyrics":
        return <SongLyricsStep controller={controller} runtime={props.songFlowRuntime} />;
      case "rights":
        return <SongRightsStep controller={controller} runtime={props.songFlowRuntime} />;
      case "review":
        return (
          <SongReviewStep
            controller={controller}
            runtime={props.songFlowRuntime}
            steps={steps}
          />
        );
    }
  };

  const stepIndicator = () => (
    <Show when={controller.tabs.activeTab === "song"}>
      <div class={controller.isMobile() ? "px-1" : "px-8 pb-1 pt-4"}>
        <PostComposerStepIndicator controller={controller} steps={steps} />
      </div>
    </Show>
  );

  return (
    <>
      <div class={cn("w-full space-y-2", !controller.isMobile() && "pt-0")}>
        <Show when={controller.isMobile()}>
          <header class="flex min-h-12 items-center justify-between gap-2 px-1">
            <IconButton
              aria-label="Close composer"
              onClick={() => props.onClose?.()}
              variant="ghost"
            >
              <IconX class="size-5" />
            </IconButton>
            <Show when={!isMultiStep()}>
              <PublishButton
                class="h-9 min-w-0 px-5"
                compact={false}
                controller={controller}
                label={controller.submit.label}
                onClick={requestPost}
              />
            </Show>
          </header>
        </Show>

        <Show
          when={controller.isMobile()}
          fallback={
            <Card class="relative mx-auto w-full max-w-3xl overflow-hidden bg-card shadow-none">
              <IconButton
                aria-label="Close composer"
                class="absolute end-3 top-3 z-10"
                onClick={() => props.onClose?.()}
                variant="ghost"
              >
                <IconX class="size-6" />
              </IconButton>
              {stepIndicator()}
              <Show when={props.mediaStatus}>{props.mediaStatus!()}</Show>
              {stepContent()}
              <Show when={isMultiStep()}>
                <PostComposerStepFooter controller={controller} steps={steps} runtime={props.songFlowRuntime} />
              </Show>
            </Card>
          }
        >
          {stepIndicator()}
          <Show when={props.mediaStatus}>{props.mediaStatus!()}</Show>
          {stepContent()}
          <Show when={isMultiStep()}>
            <div class="h-24" aria-hidden="true" />
            <PostComposerStepFooter controller={controller} steps={steps} runtime={props.songFlowRuntime} />
          </Show>
        </Show>
      </div>

      <PostComposerRequiredSheet
        controller={controller}
        onOpenChange={setRequiredSheetOpen}
        open={requiredSheetOpen()}
      />
    </>
  );
}
