import { createSignal } from "solid-js";

import {
  IconCaretRight,
  IconLock,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
  Type,
  cn,
} from "../../../design-system";
import type { PostComposerController } from "./controller";
import { PostComposerSettingsHub } from "./settings-hub";

export function PostComposerAccessRightsControl(props: {
  class?: string;
  controller: PostComposerController;
  initialOpen?: boolean;
  presentation?: "pill" | "row";
}) {
  const [open, setOpen] = createSignal(props.initialOpen ?? false);
  const row = () => props.presentation === "row";
  const accessLabel = () => props.controller.commerce.monetizationState.visible ? "Paid unlock" : "Free";

  return (
    <Modal open={open()} onOpenChange={setOpen}>
      <ModalTrigger
        aria-label={props.controller.copy.publishChips.accessRightsTitle}
        class={cn(
          row()
            ? "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-[var(--radius-xl)] border border-border-soft bg-card px-4 py-3 text-start text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            : "inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-border-soft bg-card px-3.5 text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          props.class,
        )}
      >
        <IconLock class={row() ? "size-5 shrink-0" : "size-4 shrink-0"} />
        <span class={row() ? "min-w-0 flex-1" : "min-w-0"}>
          <Type as="span" variant={row() ? "body-strong" : "label"} class="block truncate">
            {props.controller.copy.publishChips.accessRightsTitle}
          </Type>
          {row() ? <Type as="span" variant="caption" class="block text-muted-foreground">{accessLabel()}</Type> : null}
        </span>
        {row() ? <IconCaretRight class="size-5 shrink-0 text-muted-foreground" /> : null}
      </ModalTrigger>
      <ModalContent
        class="max-h-[88dvh] overflow-y-auto rounded-t-[var(--radius-3xl)] px-0 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:rounded-[var(--radius-xl)] sm:p-0"
        mobileSide="bottom"
      >
        <div aria-hidden="true" class="mx-auto mb-4 h-1 w-12 rounded-full bg-muted sm:hidden" />
        <ModalHeader class="px-4 pe-12 text-start">
          <ModalTitle>{props.controller.copy.publishChips.accessRightsTitle}</ModalTitle>
        </ModalHeader>
        <PostComposerSettingsHub controller={props.controller} />
      </ModalContent>
    </Modal>
  );
}
