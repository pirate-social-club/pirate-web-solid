import { createSignal, Show } from "solid-js";

import { Card, IconButton, IconX, createIsMobile, cn } from "../../../design-system";
import { PostComposerIdentityControl } from "./identity-control";
import { PostComposerRequiredSheet } from "./required-post-sheet";
import { PublishButton } from "./submit-actions";
import { createPostComposerController } from "./controller";
import type { PostComposerProps } from "./types";
import { PostComposerWriteStep } from "./write-step";

export function PostComposer(props: PostComposerProps) {
  const controller = createPostComposerController(props, { isMobile: createIsMobile() });
  const [requiredSheetOpen, setRequiredSheetOpen] = createSignal(props.initialRequiredSheetOpen ?? false);

  const requestPost = () => {
    if (controller.requirements.requiresPostSheet) {
      setRequiredSheetOpen(true);
      return;
    }
    controller.submit.onSubmit?.();
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
        <PublishButton
          class="h-11 min-w-0 px-4"
          compact={controller.isMobile()}
          controller={controller}
          label={controller.copy.actions.post}
          onClick={requestPost}
        />
      </header>

      <Show when={controller.isMobile()} fallback={
        <Card class="overflow-hidden bg-card shadow-none">
          <PostComposerWriteStep
            controller={controller}
            initialOpenPanel={props.initialOpenPanel}
            initialRemixSourceOpen={props.initialRemixSourceOpen}
          />
        </Card>
      }>
        <PostComposerWriteStep
          controller={controller}
          initialOpenPanel={props.initialOpenPanel}
          initialRemixSourceOpen={props.initialRemixSourceOpen}
        />
      </Show>

      <PostComposerRequiredSheet
        controller={controller}
        onOpenChange={setRequiredSheetOpen}
        open={requiredSheetOpen()}
      />
    </div>
  );
}
