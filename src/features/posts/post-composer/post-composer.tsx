import { Show } from "solid-js";

import { Card, IconButton, IconX, createIsMobile, cn } from "../../../design-system";
import { PostComposerIdentityControl } from "./identity-control";
import { PublishButton } from "./submit-actions";
import { PostComposerStepFooter } from "./step-footer";
import { SongTrackStep } from "./song-track-step";
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
    if (step === "track") return <SongTrackStep controller={controller} />;
    if (step === "lyrics") return <SongLyricsStep controller={controller} />;
    if (step === "rights") return <SongRightsStep controller={controller} />;
    if (step === "review") return <SongReviewStep controller={controller} />;
    return (
      <PostComposerWriteStep
        controller={controller}
        initialOpenPanel={props.initialOpenPanel}
      />
    );
  };

  return (
    <div class={cn("w-full space-y-3 pt-2", controller.isMobile() && "space-y-2 pt-0")}>
      <header class="flex min-h-12 items-center gap-2 px-1">
        <IconButton
          aria-label="Close composer"
          onClick={() => props.onClose?.()}
          variant="ghost"
        >
          <IconX class="size-5" />
        </IconButton>
        <Show when={controller.identity.identity?.visible !== false}>
          <PostComposerIdentityControl class="max-w-[min(15rem,calc(100vw-9rem))]" controller={controller} />
        </Show>
        <Show when={!isMultiStep()}>
          <PublishButton
            class="h-11 min-w-0 px-4"
            compact={controller.isMobile()}
            controller={controller}
            label={controller.copy.actions.post}
            onClick={requestPost}
          />
        </Show>
      </header>

      <Show when={controller.isMobile()} fallback={
        <Card class="overflow-hidden bg-card shadow-none">
          {stepContent()}
          <Show when={isMultiStep()}>
            <PostComposerStepFooter controller={controller} />
          </Show>
        </Card>
      }>
        {stepContent()}
        <Show when={isMultiStep()}>
          <div class="h-24" aria-hidden="true" />
          <PostComposerStepFooter controller={controller} />
        </Show>
      </Show>
    </div>
  );
}
