import { Show } from "solid-js";

import { Card, IconButton, IconX, createIsMobile, cn } from "../../../design-system";
import { PostComposerIdentityCluster } from "./identity-control";
import { PublishButton } from "./submit-actions";
import { PostComposerStepFooter, PostComposerStepIndicator } from "./step-footer";
import { SongStep } from "./song-step";
import { SongLyricsStep, SongReviewStep, SongRightsStep } from "./song-steps";
import { createPostComposerController } from "./controller";
import type { PostComposerProps } from "./types";
import { PostComposerWriteStep } from "./write-step";

export function PostComposer(props: PostComposerProps) {
  const controller = createPostComposerController(props, { isMobile: createIsMobile() });
  const isMultiStep = () => controller.step.list.length > 1;

  const requestPost = () => controller.submit.onSubmit?.();

  const stepContent = () => {
    const step = controller.step.current;
    if (step === "song") return <SongStep controller={controller} />;
    if (step === "lyrics") return <SongLyricsStep controller={controller} />;
    if (step === "rights") return <SongRightsStep controller={controller} />;
    if (step === "review") return <SongReviewStep controller={controller} />;
    return (
      <PostComposerWriteStep
        controller={controller}
        initialOpenPanel={props.initialOpenPanel === "access-and-rights" ? "access-and-rights" : undefined}
      >
        <Show when={!isMultiStep()}>
          <PublishButton
            class="min-w-40"
            controller={controller}
            label={controller.copy.actions.post}
            onClick={requestPost}
          />
        </Show>
      </PostComposerWriteStep>
    );
  };

  return (
    <div class={cn("w-full space-y-2", !controller.isMobile() && "pt-0")}>
      <Show when={controller.isMobile() && !isMultiStep()}>
        <header class="flex min-h-12 items-center justify-between gap-2 px-1">
          <IconButton
            aria-label="Close composer"
            onClick={() => props.onClose?.()}
            variant="ghost"
          >
            <IconX class="size-5" />
          </IconButton>
          <PublishButton
            class="h-9 min-w-0 px-5"
            controller={controller}
            label={controller.copy.actions.post}
            onClick={requestPost}
          />
        </header>
      </Show>

      <Show when={controller.isMobile() && controller.tabs.activeTab === "song"}>
        <div class="px-1">
          <PostComposerStepIndicator controller={controller} />
        </div>
      </Show>

      <Show when={controller.isMobile()} fallback={
        <Card class="relative mx-auto w-full max-w-3xl overflow-hidden bg-card shadow-none">
          <IconButton
            aria-label="Close composer"
            class="absolute end-3 top-3 z-10"
            onClick={() => props.onClose?.()}
            variant="ghost"
          >
            <IconX class="size-6" />
          </IconButton>
          <Show when={controller.tabs.activeTab === "song"}>
            <div class="px-8 pb-1 pt-4">
              <PostComposerStepIndicator controller={controller} />
            </div>
          </Show>
          <PostComposerIdentityCluster
            class="pe-16 ps-8 pb-3 pt-5"
            controller={controller}
            initialOpen={props.initialOpenPanel === "visibility"}
          />
          {stepContent()}
          <Show when={isMultiStep()}>
            <PostComposerStepFooter controller={controller} />
          </Show>
        </Card>
      }>
        <PostComposerIdentityCluster
          class="px-1 pb-1 pt-4"
          controller={controller}
          initialOpen={props.initialOpenPanel === "visibility"}
        />
        {stepContent()}
        <Show when={isMultiStep()}>
          <div class="h-24" aria-hidden="true" />
          <PostComposerStepFooter controller={controller} />
        </Show>
      </Show>
    </div>
  );
}
