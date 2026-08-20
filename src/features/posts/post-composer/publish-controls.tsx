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
  RadioIndicator,
  Type,
} from "../../../design-system";
import { cn } from "../../../design-system";

import type { PostComposerController } from "./controller";

function ChoiceRow(props: {
  checked: boolean;
  icon: "globe" | "members" | "shield";
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={props.checked ? "true" : "false"}
      class={cn(
        "grid w-full grid-cols-[2.75rem_1fr_auto] items-center gap-3 border-b border-border-soft px-4 py-3 text-start outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        props.checked && "bg-primary-subtle",
      )}
      onClick={props.onSelect}
      type="button"
    >
      <span class="grid size-11 place-items-center rounded-full bg-background text-foreground">
        {props.icon === "globe"
          ? <IconGlobe class="size-5" />
          : props.icon === "members"
            ? <IconUsersThree class="size-5" />
            : <IconShield class="size-5" />}
      </span>
      <Type as="span" variant="body-strong">{props.label}</Type>
      <RadioIndicator checked={props.checked} />
    </button>
  );
}

function VisibilityControl(props: {
  controller: PostComposerController;
  initialOpen?: boolean;
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
        class="inline-flex h-11 min-w-0 items-center gap-2 rounded-full border border-border-soft bg-card px-3.5 text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {isPublic() ? <IconGlobe class="size-4" /> : <IconUsersThree class="size-4" />}
        <Type as="span" variant="label" class="truncate">{label()}</Type>
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
                <div class="overflow-hidden rounded-[var(--radius-lg)] border border-border-soft">
                  <ChoiceRow
                    checked={isPublic()}
                    icon="globe"
                    label={controller.copy.publishChips.audiencePublic}
                    onSelect={() => updateVisibility("public")}
                  />
                  <ChoiceRow
                    checked={!isPublic()}
                    icon="members"
                    label={controller.copy.publishChips.audienceMembersOnly}
                    onSelect={() => updateVisibility("members_only")}
                  />
                </div>
              </Show>
              <Show when={controller.audience.state.publicOptionDisabledReason}>
                {(reason) => <Type as="p" variant="caption" class="sr-only">{reason()}</Type>}
              </Show>
            </section>
            <section class="space-y-3">
              <Type as="h3" variant="body-strong">{controller.copy.publishChips.ageGateTitle}</Type>
              <div class="overflow-hidden rounded-[var(--radius-lg)] border border-border-soft">
                <ChoiceRow
                  checked={!isAgeGated()}
                  icon="shield"
                  label={controller.copy.publishChips.noAgeGate}
                  onSelect={selectNone}
                />
                <ChoiceRow
                  checked={isAgeGated()}
                  icon="shield"
                  label={controller.copy.publishChips.ageGate}
                  onSelect={selectAgeGate}
                />
              </div>
            </section>
          </div>
        </Show>
      </ModalContent>
    </Modal>
  );
}

export function PostComposerPublishControls(props: {
  controller: PostComposerController;
  initialOpen?: boolean;
}) {
  return <VisibilityControl controller={props.controller} initialOpen={props.initialOpen} />;
}
