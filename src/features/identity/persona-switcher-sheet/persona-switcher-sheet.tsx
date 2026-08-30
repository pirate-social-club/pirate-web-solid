import { For } from "solid-js";

import {
  Avatar,
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
}

/** Mobile-first app-persona picker with one semantic radio row per identity. */
export function PersonaSwitcherSheet(props: PersonaSwitcherSheetProps) {
  return (
    <Modal forceMobile open={props.open} onOpenChange={props.onOpenChange}>
      <ModalContent
        class="flex max-h-[80dvh] flex-col rounded-t-[var(--radius-3xl)] px-0 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4"
        mobileSide="bottom"
      >
        <div aria-hidden="true" class="mx-auto mb-4 h-1 w-12 rounded-full bg-muted" />
        <ModalHeader class="px-4 pe-12 pb-4 text-start">
          <ModalTitle>{props.title ?? "Switch profile"}</ModalTitle>
        </ModalHeader>
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
                    <Type as="span" variant="caption" class="block truncate">{persona.publicHandle ?? persona.personaId}</Type>
                  </span>
                  <RadioIndicator checked={selected()} />
                </RadioGroupItem>
              );
            }}
          </For>
        </RadioGroup>
      </ModalContent>
    </Modal>
  );
}
