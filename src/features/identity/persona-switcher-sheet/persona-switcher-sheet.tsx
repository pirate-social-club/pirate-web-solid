import { For, Show } from "solid-js";

import {
  Avatar,
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  RadioGroup,
  RadioGroupItem,
  RadioIndicator,
  Type,
} from "../../../design-system";

export interface SwitchablePersona {
  avatarSeed?: string | null;
  avatarSrc?: string | null;
  displayName: string;
  personaId: string;
  publicHandle?: string | null;
}

export interface PersonaSwitcherSheetProps {
  onOpenChange: (open: boolean) => void;
  onSelect: (personaId: string) => void;
  open: boolean;
  personas: readonly SwitchablePersona[];
  selectedPersonaId: string;
  title?: string;
  forceMobile?: boolean;
  loading?: boolean;
  unavailable?: boolean;
  onRetry?: () => void;
  onViewProfile?: () => void;
  onSettings?: () => void;
  onAfterClose?: () => void;
}

/** Shared profile picker: bottom sheet on mobile, centered dialog on desktop. */
export function PersonaSwitcherSheet(props: PersonaSwitcherSheetProps) {
  let returnFocus: HTMLElement | undefined;
  return (
    <Modal forceMobile={props.forceMobile} open={props.open} onOpenChange={props.onOpenChange}>
      <ModalContent
        class="flex max-h-[80dvh] flex-col rounded-t-[var(--radius-3xl)] px-0 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 md:rounded-[var(--radius-xl)] md:pb-4"
        mobileSide="bottom"
        onOpenAutoFocus={() => { returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined; }}
        onCloseAutoFocus={event => { event.preventDefault(); if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); props.onAfterClose?.(); }}
      >
        <div aria-hidden="true" class="mx-auto mb-4 h-1 w-12 rounded-full bg-muted md:hidden" />
        <ModalHeader class="px-4 pe-12 pb-4 text-start">
          <ModalTitle>{props.title ?? "Switch profile"}</ModalTitle>
        </ModalHeader>
        <Show when={props.loading}><Type class="px-4 pb-4" role="status">Loading profiles…</Type></Show>
        <Show when={props.unavailable}><div class="px-4 pb-4"><Type role="alert">Profiles could not be loaded.</Type><Button onClick={props.onRetry} disabled={props.loading} variant="outline">Try again</Button></div></Show>
        <Show when={!props.loading && !props.unavailable && props.personas.length === 0}><Type class="px-4 pb-4">No active profiles yet.</Type></Show>
        <RadioGroup
          aria-label={props.title ?? "Switch profile"}
          class="min-h-0 gap-0 overflow-y-auto rounded-none border-y border-border-soft bg-transparent p-0"
          onChange={props.onSelect}
          value={props.selectedPersonaId}
        >
          <For each={props.personas}>
            {(persona) => {
              const selected = () => props.selectedPersonaId === persona.personaId;

              return (
                <RadioGroupItem
                  class="border-b border-border-soft last:border-b-0"
                  labelClass="grid min-h-[4.5rem] w-full grid-cols-[2.75rem_1fr_auto] items-center justify-normal gap-3 rounded-none px-4 py-3 text-start hover:bg-muted/60 data-checked:bg-primary-subtle data-checked:text-foreground"
                  value={persona.personaId}
                >
                  <span aria-hidden="true">
                    <Avatar
                      class="size-12 border-0 bg-background"
                      fallback={persona.displayName}
                      fallbackSeed={persona.avatarSeed ?? persona.publicHandle ?? undefined}
                      src={persona.avatarSrc ?? undefined}
                    />
                  </span>
                  <span class="min-w-0">
                    <Type as="span" variant="body-strong" class="block truncate">{persona.displayName}</Type>
                    <Type as="span" variant="caption" class="block truncate">{persona.publicHandle ?? "Profile"}</Type>
                  </span>
                  <RadioIndicator checked={selected()} />
                </RadioGroupItem>
              );
            }}
          </For>
        </RadioGroup>
        <Show when={props.onViewProfile || props.onSettings}><div class="flex flex-wrap gap-2 px-4 pt-4"><Show when={props.onViewProfile}><Button onClick={props.onViewProfile} variant="outline">View profile</Button></Show><Show when={props.onSettings}><Button onClick={props.onSettings} variant="ghost">Settings</Button></Show></div></Show>
      </ModalContent>
    </Modal>
  );
}
