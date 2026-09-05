/** @jsxImportSource @solidjs/web */

import { For, Show, createSignal } from "solid-js";

import {
  Avatar,
  IconCaretDown,
  IconPlus,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  OptionCard,
  OptionCardGroup,
  Type,
  cn,
  pillButtonVariants,
} from "../../design-system";
import type { ActivePersonaPublicProjection } from "../../api/session";
import {
  toOperationPersonas,
  type CommunityPersonaChoice,
} from "./community-persona-choice";

/** Option id for the mint branch of the closed choice; not a persona id. */
export const CREATE_NEW_PERSONA_VALUE = "__create_new_persona__";

export interface CommunityPersonaChoiceDialogProps {
  /** Visible label naming the operation, e.g. "Joining as". */
  label: string;
  /** The account's active personas; the server stays the eligibility authority. */
  personas: readonly ActivePersonaPublicProjection[];
  choice: CommunityPersonaChoice | undefined;
  onChoose: (choice: CommunityPersonaChoice) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Consequence note rendered inside the dialog before the options. */
  note?: string;
  createNewLabel?: string;
  createNewDescription?: string;
  forceMobile?: boolean;
}

function selectedValue(
  choice: CommunityPersonaChoice | undefined,
  personaIds: readonly string[],
): string | undefined {
  if (choice === undefined) return undefined;
  if (choice.kind === "create_new") return CREATE_NEW_PERSONA_VALUE;
  return personaIds.includes(choice.personaId) ? choice.personaId : undefined;
}

/**
 * The closed persona choice a terminal community membership or
 * community-creation commit carries (spec 014 §10.2): name one of the
 * account's active personas, or have the server mint a new persona bound to
 * the target community in the same commit. The dialog never claims a persona
 * is eligible for the community — the generated client carries no binding, so
 * the server's typed conflict is the authority and callers must render it
 * honestly.
 */
export function CommunityPersonaChoiceDialog(props: CommunityPersonaChoiceDialogProps) {
  const options = () => toOperationPersonas(props.personas);
  return (
    <Modal forceMobile={props.forceMobile} onOpenChange={props.onOpenChange} open={props.open}>
      <ModalContent
        class="flex max-h-[80dvh] flex-col rounded-t-[var(--radius-3xl)] px-0 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:rounded-[var(--radius-xl)] sm:p-0"
        mobileSide="bottom"
      >
        <div aria-hidden="true" class="mx-auto mb-4 h-1 w-12 rounded-full bg-muted sm:hidden" />
        <ModalHeader class="px-5 pb-4 text-start sm:px-6 sm:pt-6">
          <ModalTitle leading="tight" variant="h3">{props.label}</ModalTitle>
        </ModalHeader>
        <OptionCardGroup
          class="overflow-y-auto px-5 pb-4 sm:px-6 sm:pb-6"
          label={props.label}
          onChange={(value) => {
            props.onChoose(
              value === CREATE_NEW_PERSONA_VALUE
                ? { kind: "create_new" }
                : { kind: "existing", personaId: value },
            );
          }}
          value={selectedValue(
            props.choice,
            options().map((option) => option.personaId),
          )}
        >
          <For each={options()}>
            {(persona) => (
              <OptionCard
                description={persona.publicHandle ?? undefined}
                icon={
                  <Avatar
                    class="size-12 border-0 bg-card text-base"
                    fallback={persona.displayName}
                    src={persona.avatarSrc ?? undefined}
                  />
                }
                title={persona.displayName}
                value={persona.personaId}
              />
            )}
          </For>
          <OptionCard
            description={props.createNewDescription
              ?? "Mint a fresh persona bound to this community in the same step."}
            icon={<IconPlus class="size-8" />}
            title={props.createNewLabel ?? "Create a new persona"}
            value={CREATE_NEW_PERSONA_VALUE}
          />
        </OptionCardGroup>
        <Show when={props.note}>
          {(note) => (
            <p class="px-5 pb-5 text-sm text-muted-foreground sm:px-6" data-choice-note>
              {note()}
            </p>
          )}
        </Show>
      </ModalContent>
    </Modal>
  );
}

export interface CommunityPersonaChoiceControlProps {
  /** Visible label naming the operation, e.g. "Joining as". */
  label: string;
  personas: readonly ActivePersonaPublicProjection[];
  choice: CommunityPersonaChoice | undefined;
  onChoose: (choice: CommunityPersonaChoice) => void;
  /** Shown while no branch of the closed choice is selected. */
  placeholder?: string;
  /** Consequence note rendered inside the dialog before the options. */
  note?: string;
  createNewLabel?: string;
  createNewDescription?: string;
  disabled?: boolean;
  forceMobile?: boolean;
  class?: string;
}

/** Trigger button plus {@link CommunityPersonaChoiceDialog}, for inline forms. */
export function CommunityPersonaChoiceControl(props: CommunityPersonaChoiceControlProps) {
  const [open, setOpen] = createSignal(false);
  const options = () => toOperationPersonas(props.personas);
  const chosen = () =>
    props.choice?.kind === "existing"
      ? options().find((persona) => persona.personaId === props.choice?.personaId)
      : undefined;
  const summary = () =>
    props.choice === undefined
      ? props.placeholder ?? ""
      : props.choice.kind === "create_new"
        ? props.createNewLabel ?? "New persona"
        : chosen()?.displayName ?? "";

  return (
    <div class={cn("flex min-w-0 items-center gap-2", props.class)} data-community-persona-choice>
      <Type as="span" class="shrink-0" variant="caption">
        {props.label}
      </Type>
      <button
        aria-haspopup="dialog"
        class={cn(pillButtonVariants({ tone: "default" }), "min-w-0 gap-2 px-3 text-foreground")}
        data-choice-state={props.choice === undefined ? "unselected" : props.choice.kind}
        disabled={props.disabled}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Avatar
          class="size-6 border-0 bg-card text-base"
          fallback={summary() || props.label}
          src={chosen()?.avatarSrc ?? undefined}
        />
        <Type as="span" class="min-w-0 truncate" variant="body-strong">
          {summary()}
        </Type>
        <IconCaretDown class="size-4 shrink-0" />
      </button>
      <CommunityPersonaChoiceDialog
        choice={props.choice}
        createNewDescription={props.createNewDescription}
        createNewLabel={props.createNewLabel}
        forceMobile={props.forceMobile}
        label={props.label}
        note={props.note}
        onChoose={(choice) => {
          props.onChoose(choice);
          setOpen(false);
        }}
        onOpenChange={setOpen}
        open={open()}
        personas={props.personas}
      />
    </div>
  );
}
