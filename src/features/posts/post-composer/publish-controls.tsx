import { Show, createSignal } from "solid-js";

import {
  Button,
  IconGlobe,
  IconShield,
  IconUsersThree,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
  Type,
  buttonVariants,
} from "../../../design-system";
import { cn } from "../../../design-system";

import type { PostComposerController } from "./controller";
import { PostComposerSheetRadioGroup } from "./sheet-radio-group";

function VisibilityControl(props: {
  class?: string;
  controller: PostComposerController;
  initialOpen?: boolean;
  presentation?: "pill" | "icon";
}) {
  const controller = props.controller;
  const [open, setOpen] = createSignal(props.initialOpen ?? false);
  const [confirming, setConfirming] = createSignal(false);
  const isPublic = () => controller.audience.state.visibility === "public";
  const isAgeGated = () => controller.audience.ageGatePolicy === "18_plus";
  const audienceLabel = () => isPublic()
    ? controller.copy.publishChips.audiencePublic
    : controller.copy.publishChips.audienceMembersOnly;
  const label = () => isAgeGated()
    ? `${audienceLabel()} · ${controller.copy.publishChips.ageGate}`
    : audienceLabel();
  const canChooseAudience = () => controller.audience.state.publicOptionEnabled !== false;
  const close = () => {
    setConfirming(false);
    setOpen(false);
  };
  const updateVisibility = (visibility: "members_only" | "public") => {
    controller.audience.update((current) => ({ ...current, visibility }));
    close();
  };
  const selectNone = () => {
    controller.audience.setAgeGatePolicy("none");
    close();
  };
  const selectAgeGate = () => {
    if (controller.audience.ageGateConfirmationRequired) {
      setConfirming(true);
      return;
    }
    controller.audience.setAgeGatePolicy("18_plus");
    close();
  };
  const confirmAgeGate = () => {
    controller.audience.setAgeGatePolicy("18_plus");
    close();
  };

  return (
    <Modal
      open={open()}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirming(false);
      }}
    >
      <ModalTrigger
        aria-label={`${controller.copy.publishChips.visibilityTitle}: ${label()}`}
        class={cn(
          props.presentation === "icon"
            ? cn(buttonVariants({ variant: "secondary", size: "icon" }), "size-10")
            : "inline-flex h-11 min-w-0 items-center gap-2 rounded-full border border-border-soft bg-card px-3.5 text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          props.class,
        )}
      >
        {isPublic() ? <IconGlobe class={props.presentation === "icon" ? "size-5" : "size-4"} /> : <IconUsersThree class={props.presentation === "icon" ? "size-5" : "size-4"} />}
        <Show when={props.presentation !== "icon"}>
          <Type as="span" variant="label" class="truncate">{label()}</Type>
        </Show>
      </ModalTrigger>
      <ModalContent
        class="max-h-[88dvh] overflow-y-auto rounded-t-[var(--radius-3xl)] px-0 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:rounded-[var(--radius-xl)] sm:p-0"
        mobileSide="bottom"
      >
        <div aria-hidden="true" class="mx-auto mb-4 h-1 w-12 rounded-full bg-muted sm:hidden" />
        <Show
          when={!confirming()}
          fallback={
            <div class="space-y-5 px-4">
              <ModalHeader class="pe-12 text-start">
                <ModalTitle>{controller.copy.publishChips.ageGateConfirmTitle}</ModalTitle>
              </ModalHeader>
              <div class="flex items-center justify-end gap-2">
                <Button onClick={() => setConfirming(false)} variant="outline">
                  {controller.copy.publishChips.ageGateConfirmCancel}
                </Button>
                <Button onClick={confirmAgeGate}>{controller.copy.publishChips.ageGateConfirm}</Button>
              </div>
            </div>
          }
        >
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
                      <IconUsersThree class="size-5" />
                    </span>
                    <Type as="span" variant="body-strong">{audienceLabel()}</Type>
                  </div>
                }
              >
                <PostComposerSheetRadioGroup
                  aria-label={controller.copy.publishChips.audienceTitle}
                  onChange={updateVisibility}
                  options={[
                    {
                      icon: <IconGlobe class="size-5" />,
                      label: controller.copy.publishChips.audiencePublic,
                      value: "public",
                    },
                    {
                      icon: <IconUsersThree class="size-5" />,
                      label: controller.copy.publishChips.audienceMembersOnly,
                      value: "members_only",
                    },
                  ]}
                  value={controller.audience.state.visibility}
                />
              </Show>
              <Show when={controller.audience.state.publicOptionDisabledReason}>
                {(reason) => <Type as="p" variant="caption" class="sr-only">{reason()}</Type>}
              </Show>
            </section>
            <section class="space-y-3">
              <Type as="h3" variant="body-strong">{controller.copy.publishChips.ageGateTitle}</Type>
              <PostComposerSheetRadioGroup
                aria-label={controller.copy.publishChips.ageGateTitle}
                onChange={(value) => value === "18_plus" ? selectAgeGate() : selectNone()}
                options={[
                  {
                    icon: <IconShield class="size-5" />,
                    label: controller.copy.publishChips.noAgeGate,
                    value: "none",
                  },
                  {
                    icon: <IconShield class="size-5" />,
                    label: controller.copy.publishChips.ageGate,
                    value: "18_plus",
                  },
                ]}
                value={controller.audience.ageGatePolicy}
              />
            </section>
          </div>
        </Show>
      </ModalContent>
    </Modal>
  );
}

export function PostComposerPublishControls(props: {
  class?: string;
  controller: PostComposerController;
  initialOpen?: boolean;
  presentation?: "pill" | "icon";
}) {
  return <VisibilityControl class={props.class} controller={props.controller} initialOpen={props.initialOpen} presentation={props.presentation} />;
}
