import { createSignal, Show } from "solid-js";

import { ActionFooterShell, Card, IconButton, IconX, createIsMobile, cn } from "../../../design-system";
import { createComposerSteps } from "./composer-steps";
import { PostComposerRequiredSheet } from "./required-post-sheet";
import { PublishButton } from "./submit-actions";
import { createPostComposerController } from "./controller";
import { SongStep } from "./song-step";
import { SongReviewStep, SongRightsStep } from "./song-steps";
import { PostComposerStepFooter } from "./step-footer";
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
            attachmentBarPlacement={props.attachmentBarPlacement}
            onVideoEntry={props.onVideoEntry}
            controller={controller}
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
      case "rights":
        return (
          <SongRightsStep
            controller={controller}
            recipients={props.recipientProfiles}
            runtime={props.songFlowRuntime}
          />
        );
      case "review":
        return (
          <SongReviewStep
            controller={controller}
            recipients={props.recipientProfiles}
            runtime={props.songFlowRuntime}
            steps={steps}
          />
        );
    }
  };

  // Mobile header: close on the left; a single-step post publishes from an
  // icon button on the right, whose accessible name is the post label.
  const mobileHeader = () => (
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
          compact
          controller={controller}
          label={controller.submit.label}
          onClick={requestPost}
        />
      </Show>
    </header>
  );

  return (
    <>
      <div class={cn("w-full space-y-2", !controller.isMobile() && "pt-0")}>
        <Show when={controller.isMobile() && !isMultiStep()}>{mobileHeader()}</Show>

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
              <Show when={props.mediaStatus}>{props.mediaStatus!()}</Show>
              {stepContent()}
              <Show when={isMultiStep()}>
                <PostComposerStepFooter
                  controller={controller}
                  placement={props.attachmentBarPlacement}
                  runtime={props.songFlowRuntime}
                  steps={steps}
                />
              </Show>
            </Card>
          }
        >
          {/* A multi-step track keeps Continue pinned at the bottom in the
              shared action footer; a single-step post publishes from the header. */}
          <Show
            when={isMultiStep()}
            fallback={<>
              <Show when={props.mediaStatus}>{props.mediaStatus!()}</Show>
              {stepContent()}
            </>}
          >
            <ActionFooterShell
              class="h-[calc(100dvh-2rem)]"
              header={mobileHeader()}
              footer={(
                <PostComposerStepFooter
                  bare
                  controller={controller}
                  placement={props.attachmentBarPlacement}
                  runtime={props.songFlowRuntime}
                  steps={steps}
                />
              )}
            >
              <Show when={props.mediaStatus}>{props.mediaStatus!()}</Show>
              {stepContent()}
            </ActionFooterShell>
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
