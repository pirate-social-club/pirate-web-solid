import { createSignal, Show } from "solid-js";

import { Card, IconButton, IconX, createIsMobile, cn } from "../../../design-system";
import { PostComposerIdentityControl } from "./identity-control";
import { PostComposerRequiredSheet } from "./required-post-sheet";
import { PublishButton } from "./submit-actions";
import { createPostComposerController } from "./controller";
import { PostComposerFormShell } from "./form-shell";
import { SongUploadFlow } from "./song-upload-flow";
import type { PostComposerProps } from "./types";
import { PostComposerWriteStep } from "./write-step";

export function PostComposer(props: PostComposerProps) {
  const controller = createPostComposerController(props, { isMobile: createIsMobile() });
  const [requiredSheetOpen, setRequiredSheetOpen] = createSignal(false);
  // Embedded is a size, not a different composer. It used to select a second
  // inline layout for text, so the surface a host shipped and the surface
  // Storybook reviewed were not the same one.
  const embedded = () => props.presentation === "embedded";
  const structuredMode = () => {
    const mode = controller.tabs.activeTab;
    return mode === "text" || mode === "video" || mode === "song" ? mode : null;
  };

  const requestPost = () => {
    if (controller.requirements.requiresPostSheet) {
      setRequiredSheetOpen(true);
      return;
    }
    controller.submit.onSubmit?.();
  };

  return (
    <>
      <Show
        when={structuredMode()}
        fallback={
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
                label={controller.submit.label}
                onClick={requestPost}
              />
            </header>

            <Show when={controller.isMobile()} fallback={
              <Card class="overflow-hidden bg-card shadow-none">
                <PostComposerWriteStep onVideoEntry={props.onVideoEntry} controller={controller} initialOpenPanel={props.initialOpenPanel} />
              </Card>
            }>
              <PostComposerWriteStep onVideoEntry={props.onVideoEntry} controller={controller} initialOpenPanel={props.initialOpenPanel} />
            </Show>
          </div>
        }
      >
        {(mode) => (
          <Show
            when={mode() === "song"}
            fallback={
              <PostComposerFormShell
                controller={controller}
                embedded={embedded()}
                onClose={() => props.onClose?.()}
                onSubmit={requestPost}
              >
                <PostComposerWriteStep onVideoEntry={props.onVideoEntry}
                  controller={controller}
                  initialOpenPanel={props.initialOpenPanel}
                  structuredLayout={mode() === "video" ? "video" : "text"}
                />
              </PostComposerFormShell>
            }
          >
            <SongUploadFlow
              controller={controller}
              initialStep={props.initialSongStep}
              runtime={props.songFlowRuntime}
              onClose={() => props.onClose?.()}
              onSubmit={requestPost}
            />
          </Show>
        )}
      </Show>

      <PostComposerRequiredSheet
        controller={controller}
        onOpenChange={setRequiredSheetOpen}
        open={requiredSheetOpen()}
      />
    </>
  );
}
