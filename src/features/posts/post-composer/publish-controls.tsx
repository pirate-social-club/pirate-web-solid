import { Show, createSignal } from "solid-js";

import {
  Button,
  IconGlobe,
  IconLock,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
  OptionCard,
  Switch,
  Type,
} from "../../../design-system";

import type { PostComposerController } from "./controller";

function VisibilityControl(props: {
  controller: PostComposerController;
  initialOpen?: boolean;
  initialConfirming?: boolean;
}) {
  const controller = props.controller;
  const [open, setOpen] = createSignal(props.initialOpen ?? false);
  const [confirming, setConfirming] = createSignal(props.initialConfirming ?? false);
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
  };
  const toggleAgeGate = (checked: boolean) => {
    if (!checked) {
      controller.audience.setAgeGatePolicy("none");
      return;
    }
    if (controller.audience.ageGateConfirmationRequired) {
      setConfirming(true);
      return;
    }
    controller.audience.setAgeGatePolicy("18_plus");
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
        class="inline-flex h-11 min-w-0 items-center gap-2 rounded-full border border-border-soft bg-card px-3.5 text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {isPublic() ? <IconGlobe class="size-4" /> : <IconLock class="size-4" />}
        <Type as="span" variant="label" class="truncate">{label()}</Type>
      </ModalTrigger>
      <ModalContent
        class="max-h-[88dvh] overflow-y-auto rounded-t-[var(--radius-3xl)] px-0 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:rounded-[var(--radius-xl)] sm:pb-6 sm:pt-6"
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
            <section class="space-y-3">
              <Type as="h3" variant="body-strong">{controller.copy.publishChips.ageGateTitle}</Type>
              <div class="flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-border-soft bg-card p-4">
                <div class="space-y-1">
                  <Type as="div" variant="body-strong">{controller.copy.publishChips.ageGate}</Type>
                  <Type as="p" variant="caption" class="text-muted-foreground">
                    {controller.copy.publishChips.ageGateDescription}
                  </Type>
                </div>
                <Switch
                  aria-label={controller.copy.publishChips.ageGate}
                  checked={isAgeGated()}
                  onChange={toggleAgeGate}
                />
              </div>
            </section>
            <Button class="w-full" onClick={close} size="lg">
              {controller.copy.publishChips.done}
            </Button>
          </div>
        </Show>
      </ModalContent>
    </Modal>
  );
}

export function PostComposerPublishControls(props: {
  controller: PostComposerController;
  initialOpen?: boolean;
  initialConfirming?: boolean;
}) {
  return (
    <VisibilityControl
      controller={props.controller}
      initialConfirming={props.initialConfirming}
      initialOpen={props.initialOpen}
    />
  );
}
