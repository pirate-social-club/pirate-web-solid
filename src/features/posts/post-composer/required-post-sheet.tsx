import { Show } from "solid-js";

import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  Type,
} from "../../../design-system";
import type { PostComposerController } from "./controller";
import { FieldLabel } from "./fields";

export function PostComposerRequiredSheet(props: {
  controller: PostComposerController;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const controller = props.controller;
  const canPost = () => !controller.requirements.requiresPostSheet && !controller.submit.postDisabled;

  return (
    <Modal open={props.open} onOpenChange={props.onOpenChange}>
      <ModalContent
        class="max-h-[88dvh] overflow-y-auto rounded-t-[var(--radius-3xl)] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:rounded-[var(--radius-xl)] sm:p-6"
        mobileSide="bottom"
      >
        <div aria-hidden="true" class="mx-auto mb-4 h-1 w-12 rounded-full bg-muted sm:hidden" />
        <ModalHeader class="pe-12 text-start">
          <ModalTitle>Before you post</ModalTitle>
        </ModalHeader>

        <div class="mt-5 space-y-6">
          <Show when={controller.tabs.activeTab === "song"}>
            <section class="space-y-4">
              <div>
                <Type as="h3" variant="body-strong">Song details</Type>
                <Type as="p" variant="caption" class="mt-1 text-muted-foreground">
                  Add the required release information. Optional song details stay out of the posting flow.
                </Type>
              </div>

              <Show when={controller.requirements.songTitleMissing}>
                <div>
                  <FieldLabel htmlFor="required-song-title" label="Song title" required />
                  <Input
                    id="required-song-title"
                    onChange={(event) => controller.song.update((current) => ({ ...current, title: event.currentTarget.value }))}
                    placeholder="Track title"
                    value={controller.song.state.title ?? ""}
                  />
                </div>
              </Show>

            </section>
          </Show>

          <Button
            class="w-full"
            disabled={!canPost() || controller.submit.loading}
            loading={controller.submit.loading}
            onClick={() => controller.submit.onSubmit?.()}
            size="lg"
          >
            {controller.copy.actions.post}
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}
