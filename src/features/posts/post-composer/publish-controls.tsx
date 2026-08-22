import { Show, createSignal } from "solid-js";

import {
  Button,
  IconCaretDown,
  IconGlobe,
  IconLock,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
  OptionCard,
  Type,
} from "../../../design-system";
import { cn } from "../../../design-system";

import type { PostComposerController } from "./controller";
import { composerPillTriggerClass, composerRowTriggerClass } from "./composer-pills";

function VisibilityControl(props: {
  controller: PostComposerController;
  initialOpen?: boolean;
  variant?: "pill" | "row";
}) {
  const controller = props.controller;
  const row = () => props.variant === "row";
  const [open, setOpen] = createSignal(props.initialOpen ?? false);
  const isPublic = () => controller.audience.state.visibility === "public";
  const audienceLabel = () => isPublic()
    ? controller.copy.publishChips.audiencePublic
    : controller.copy.publishChips.audienceMembersOnly;
  const canChooseAudience = () => controller.audience.state.publicOptionEnabled !== false;
  const close = () => setOpen(false);
  const updateVisibility = (visibility: "members_only" | "public") => {
    controller.audience.update((current) => ({ ...current, visibility }));
  };

  return (
    <Modal open={open()} onOpenChange={setOpen}>
      <ModalTrigger
        aria-label={`${controller.copy.publishChips.visibilityTitle}: ${audienceLabel()}`}
        class={cn(row()
          ? composerRowTriggerClass
          : cn(composerPillTriggerClass, "px-3.5"))}
      >
        {isPublic()
          ? <IconGlobe class={cn("size-4 shrink-0", row() && "text-muted-foreground", row() && !controller.isMobile() && "size-5")} />
          : <IconLock class={cn("size-4 shrink-0", row() && "text-muted-foreground", row() && !controller.isMobile() && "size-5")}/>}
        <Type
          as="span"
          class={cn("truncate", row() ? "text-muted-foreground" : "text-foreground", row() && !controller.isMobile() && "text-lg")}
          variant={row() ? "caption" : "body-strong"}
        >
          {audienceLabel()}
        </Type>
        <Show when={row()}>
          <IconCaretDown class={cn("shrink-0 text-muted-foreground", controller.isMobile() ? "size-4" : "size-5")} />
        </Show>
      </ModalTrigger>
      <ModalContent
        class="max-h-[88dvh] overflow-y-auto rounded-t-[var(--radius-3xl)] px-0 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:rounded-[var(--radius-xl)] sm:pb-6 sm:pt-6"
        mobileSide="bottom"
      >
        <div aria-hidden="true" class="mx-auto mb-4 h-1 w-12 rounded-full bg-muted sm:hidden" />
        <ModalHeader class="px-4 pe-12 text-start">
          <ModalTitle>{controller.copy.publishChips.visibilityTitle}</ModalTitle>
        </ModalHeader>
        <div class="space-y-6 px-4 pt-5">
          <section class="space-y-3">
            <Type as="h3" variant="body-strong">{controller.copy.publishChips.audienceTitle}</Type>
            <Show
              when={canChooseAudience()}
              fallback={
                <div class="flex min-h-14 items-center gap-3 rounded-[var(--radius-lg)] border border-border-soft bg-card px-4 py-3.5">
                  <span class="grid size-11 place-items-center rounded-full bg-background text-foreground">
                    <IconLock class="size-5" />
                  </span>
                  <Type as="span" variant="body-strong">{audienceLabel()}</Type>
                </div>
              }
            >
              <div class="space-y-2">
                <OptionCard
                  icon={<IconGlobe class="size-6" />}
                  onClick={() => updateVisibility("public")}
                  selected={isPublic()}
                  title={controller.copy.publishChips.audiencePublic}
                />
                <OptionCard
                  icon={<IconLock class="size-6" />}
                  onClick={() => updateVisibility("members_only")}
                  selected={!isPublic()}
                  title={controller.copy.publishChips.audienceMembersOnly}
                />
              </div>
            </Show>
            <Show when={controller.audience.state.publicOptionDisabledReason}>
              {(reason) => <Type as="p" variant="caption" class="sr-only">{reason()}</Type>}
            </Show>
          </section>
          <Button class="w-full" onClick={close} size="lg">
            {controller.copy.publishChips.done}
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}

export function PostComposerPublishControls(props: {
  controller: PostComposerController;
  initialOpen?: boolean;
  variant?: "pill" | "row";
}) {
  return (
    <VisibilityControl
      controller={props.controller}
      initialOpen={props.initialOpen}
      variant={props.variant}
    />
  );
}
