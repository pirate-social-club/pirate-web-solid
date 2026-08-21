import { For, Show, createMemo, createSignal } from "solid-js";

import {
  Avatar,
  IconCaretDown,
  IconMaskHappy,
  IconRobot,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
  pillButtonVariants,
  RadioIndicator,
  Type,
} from "../../../design-system";
import { cn } from "../../../design-system";

import type { PostComposerController } from "./controller";

function publicInitials(handle: string) {
  const chunks = handle.replace(/^@/, "").trim().split(/[-.\s_]+/).filter(Boolean);
  if (chunks.length === 0) return "me";
  if (chunks.length === 1) return chunks[0]!.slice(0, 2).toLowerCase();
  return `${chunks[0]![0] ?? ""}${chunks[1]![0] ?? ""}`.toLowerCase();
}

export function PostComposerIdentityControl(props: {
  class?: string;
  controller: PostComposerController;
}) {
  const controller = props.controller;
  const [open, setOpen] = createSignal(false);
  const identity = () => controller.identity.identity;
  const publicLabel = () => identity()?.publicHandle ?? "name.pirate";
  const anonymousLabel = () => identity()?.anonymousLabel ?? "Pseudonym";
  const agentLabel = () => identity()?.agentLabel;
  const isAgent = () => controller.identity.authorMode === "agent";
  const isAnonymous = () => !isAgent() && controller.identity.identityMode === "anonymous";
  const qualifiers = createMemo(() => identity()?.availableQualifiers?.filter((qualifier) => !qualifier.suppressedByClubGate) ?? []);
  const selectedQualifierCount = () => qualifiers()
    .filter((qualifier) => controller.identity.selectedQualifierIds.includes(qualifier.qualifierId))
    .length;
  const qualifierLabel = () => selectedQualifierCount() > 0
    ? controller.copy.identitySheet.qualifierCount(selectedQualifierCount())
    : undefined;
  const triggerLabel = () => isAgent()
    ? agentLabel() ?? "Agent"
    : isAnonymous()
      ? anonymousLabel()
      : publicLabel();
  const canUseAnonymous = () => identity()?.allowAnonymousIdentity === true;
  const canUseQualifiers = () => isAnonymous()
    && identity()?.allowQualifiersOnAnonymousPosts !== false
    && qualifiers().length > 0;

  const selectPublic = () => {
    controller.identity.setAuthorMode("human");
    controller.identity.setIdentityMode("public");
    setOpen(false);
  };
  const selectAnonymous = () => {
    controller.identity.setAuthorMode("human");
    controller.identity.setIdentityMode("anonymous");
    if (!canUseQualifiers()) setOpen(false);
  };
  const selectAgent = () => {
    controller.identity.setIdentityMode("public");
    controller.identity.setAuthorMode("agent");
    setOpen(false);
  };
  const toggleQualifier = (qualifierId: string) => {
    const selected = controller.identity.selectedQualifierIds;
    controller.identity.setSelectedQualifierIds(
      selected.includes(qualifierId)
        ? selected.filter((id) => id !== qualifierId)
        : [...selected, qualifierId],
    );
  };

  const IdentityAvatar = (avatarProps: { class?: string }) => (
    <Show
      when={!isAgent()}
      fallback={<span class={cn("grid place-items-center rounded-full bg-background text-foreground", avatarProps.class)}><IconRobot class="size-5" /></span>}
    >
      <Show
        when={!isAnonymous()}
        fallback={<span class={cn("grid place-items-center rounded-full bg-background text-foreground", avatarProps.class)}><IconMaskHappy class="size-5" /></span>}
      >
        <Avatar
          class={cn("border-0", avatarProps.class)}
          fallback={publicInitials(publicLabel())}
          fallbackSeed={identity()?.publicAvatarSeed ?? undefined}
          src={identity()?.publicAvatarSrc ?? undefined}
        />
      </Show>
    </Show>
  );

  const Option = (optionProps: {
    checked: boolean;
    description: string;
    icon: "agent" | "anonymous" | "public";
    label: string;
    onSelect: () => void;
  }) => (
    <button
      aria-pressed={optionProps.checked ? "true" : "false"}
      class={cn(
        "grid w-full grid-cols-[2.75rem_1fr_auto] items-center gap-3 border-b border-border-soft px-4 py-3 text-start outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        optionProps.checked && "bg-primary-subtle",
      )}
      onClick={optionProps.onSelect}
      type="button"
    >
      <Show
        when={optionProps.icon === "public"}
        fallback={
          <span class="grid size-11 place-items-center rounded-full bg-background text-foreground">
            {optionProps.icon === "agent" ? <IconRobot class="size-5" /> : <IconMaskHappy class="size-5" />}
          </span>
        }
      >
        <Avatar
          class="size-11 border-0"
          fallback={publicInitials(publicLabel())}
          fallbackSeed={identity()?.publicAvatarSeed ?? undefined}
          src={identity()?.publicAvatarSrc ?? undefined}
        />
      </Show>
      <span class="min-w-0">
        <Type as="span" variant="body-strong" class="block truncate">{optionProps.label}</Type>
        <Type as="span" variant="caption" class="block text-muted-foreground">{optionProps.description}</Type>
      </span>
      <RadioIndicator checked={optionProps.checked} />
    </button>
  );

  return (
    <Show when={identity()?.visible !== false}>
      <Modal open={open()} onOpenChange={setOpen}>
        <ModalTrigger
          aria-label={[
            `${controller.copy.identitySheet.title}: ${triggerLabel()}`,
            qualifierLabel(),
          ].filter(Boolean).join(", ")}
          class={cn(
            pillButtonVariants({ tone: "default" }),
            "h-11 min-w-0 justify-start gap-3 px-3.5 text-foreground",
            props.class,
          )}
        >
          <IdentityAvatar class="size-8 shrink-0" />
          <span class="min-w-0 flex-1 text-start">
            <Type as="span" variant="body-strong" class="block truncate">{triggerLabel()}</Type>
          </span>
          <IconCaretDown class="size-4 shrink-0 text-muted-foreground" />
        </ModalTrigger>
        <ModalContent
          class="flex max-h-[80dvh] flex-col rounded-t-[var(--radius-3xl)] px-0 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:rounded-[var(--radius-xl)] sm:p-0"
          mobileSide="bottom"
        >
          <div aria-hidden="true" class="mx-auto mb-4 h-1 w-12 rounded-full bg-muted sm:hidden" />
          <ModalHeader class="px-4 pe-12 text-start">
            <ModalTitle>{controller.copy.identitySheet.title}</ModalTitle>
          </ModalHeader>
          <div class="mt-4 min-h-0 overflow-y-auto border-t border-border-soft">
            <Option
              checked={!isAgent() && !isAnonymous()}
              description={controller.copy.identitySheet.publicRowDescription}
              icon="public"
              label={publicLabel()}
              onSelect={selectPublic}
            />
            <Show when={canUseAnonymous()}>
              <Option
                checked={isAnonymous()}
                description={identity()?.anonymousDescription ?? controller.copy.identitySheet.anonymousRowDescription}
                icon="anonymous"
                label={anonymousLabel()}
                onSelect={selectAnonymous}
              />
            </Show>
            <Show when={agentLabel()}>
              {(label) => (
                <Option
                  checked={isAgent()}
                  description={controller.copy.identitySheet.agentRowDescription}
                  icon="agent"
                  label={label()}
                  onSelect={selectAgent}
                />
              )}
            </Show>
            <Show when={canUseQualifiers()}>
              <section class="space-y-2 px-4 py-4">
                <Type as="h3" variant="body-strong">{controller.copy.identitySheet.qualifiersTitle}</Type>
                <Type as="p" variant="caption" class="text-muted-foreground">{controller.copy.identitySheet.qualifiersApply}</Type>
                <div class="space-y-2 pt-1">
                  <For each={qualifiers()}>
                    {(qualifier) => {
                      const selected = () => controller.identity.selectedQualifierIds.includes(qualifier.qualifierId);
                      return (
                        <button
                          aria-pressed={selected() ? "true" : "false"}
                          class={cn(
                            "flex w-full items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border-soft px-3 py-3 text-start outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                            selected() && "border-primary bg-primary-subtle",
                          )}
                          onClick={() => toggleQualifier(qualifier.qualifierId)}
                          type="button"
                        >
                          <span class="min-w-0">
                            <Type as="span" variant="body-strong" class="block">{qualifier.label}</Type>
                            <Show when={qualifier.description}>
                              {(description) => <Type as="span" variant="caption" class="block text-muted-foreground">{description()}</Type>}
                            </Show>
                          </span>
                          <RadioIndicator checked={selected()} />
                        </button>
                      );
                    }}
                  </For>
                </div>
              </section>
            </Show>
          </div>
        </ModalContent>
      </Modal>
    </Show>
  );
}
