import type { JSX } from "@solidjs/web";
import type { ParentProps } from "solid-js";

import { IconButton, IconX } from "../../../design-system";
import type { PostComposerController } from "./controller";
import { PostComposerIdentityControl } from "./identity-control";
import { PostComposerPublishControls } from "./publish-controls";
import { PublishButton } from "./submit-actions";

export function PostComposerPageFrame(props: ParentProps<{
  footer: JSX.Element;
  header: JSX.Element;
}>) {
  return (
    <div class="flex h-dvh w-full flex-col bg-background sm:mx-auto sm:h-[min(44rem,calc(100dvh-6rem))] sm:max-w-2xl sm:overflow-hidden sm:rounded-[var(--radius-2xl)] sm:border sm:border-border-soft">
      <header class="shrink-0 border-b border-border-soft">
        <div class="mx-auto flex h-[88px] w-full max-w-2xl items-center gap-3 px-6">
          {props.header}
        </div>
      </header>

      <main class="min-h-0 flex-1 overflow-y-auto">
        <div class="mx-auto w-full max-w-2xl">
          {props.children}
        </div>
      </main>

      <footer class="shrink-0 border-t border-border-soft bg-background">
        <div class="mx-auto w-full max-w-2xl px-6 pb-[calc(env(safe-area-inset-bottom)+.75rem)] pt-3">
          {props.footer}
        </div>
      </footer>
    </div>
  );
}

export function PostComposerFormShell(props: ParentProps<{
  controller: PostComposerController;
  onClose?: () => void;
  onSubmit: () => void;
}>) {
  return (
    <PostComposerPageFrame
      header={
        <>
          <IconButton
            aria-label="Close composer"
            class="size-10 bg-secondary"
            onClick={props.onClose}
            variant="secondary"
          >
            <IconX class="size-5" />
          </IconButton>
          <div class="ms-auto flex items-center gap-2">
            <PostComposerPublishControls controller={props.controller} presentation="icon" />
            <PostComposerIdentityControl controller={props.controller} presentation="icon" />
          </div>
        </>
      }
      footer={
        <PublishButton
          class="h-11 w-full"
          controller={props.controller}
          label={props.controller.submit.label}
          onClick={props.onSubmit}
          size="default"
        />
      }
    >
      {props.children}
    </PostComposerPageFrame>
  );
}
