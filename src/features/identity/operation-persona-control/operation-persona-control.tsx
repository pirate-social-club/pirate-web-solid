/** @jsxImportSource @solidjs/web */

import { For, Show, createSignal } from "solid-js";

import {
  Avatar,
  IconCaretDown,
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  OptionCard,
  OptionCardGroup,
  Type,
  cn,
  pillButtonVariants,
} from "../../../design-system";

/**
 * A persona the signed-in account may act as. Mirrors the API persona object
 * carried by `persona_role_presentation`.
 */
export interface OperationPersona {
  personaId: string;
  displayName: string;
  avatarSrc?: string | null;
  publicHandle?: string | null;
}

export interface OperationPersonaControlProps {
  class?: string;
  /** Visible label naming the operation, e.g. "Creating as". */
  label: string;
  personas: readonly OperationPersona[];
  selectedPersonaId?: string;
  onSelect?: (personaId: string) => void;
  disabled?: boolean;
  forceMobile?: boolean;
  /**
   * Text shown while no persona is selected. Community-facing selectors leave
   * the choice unselected when more than one persona could act, so the trigger
   * must say what is missing instead of rendering an empty identity.
   */
  placeholder?: string;
}

/**
 * OperationPersonaControl - the low-level persona picker: a labelled trigger
 * and a list of the account's personas.
 *
 * It is deliberately not the post composer's identity control. That control
 * chooses an authorship mode per publication (public, anonymous, agent) plus
 * anonymous qualifiers, and it changes what a single post reveals. This one
 * only names a persona, and callers supply the label and the consequence.
 *
 * Callers must decide the semantics, because they differ sharply:
 *
 * - Posting asks who is authoring this one post, and the answer is reversible
 *   by posting differently next time.
 * - Community creation does not ask who is acting at all. Spec 014 §2 grants
 *   the role to the account; the account merely designates which persona
 *   presents that role publicly. That designation is not an operation actor,
 *   and it should stay out of the way of creating the community.
 *
 * With fewer than two personas there is no choice to present; hosts should
 * render nothing rather than state a persona the account cannot change.
 */
export function OperationPersonaControl(props: OperationPersonaControlProps) {
  const [open, setOpen] = createSignal(false);
  const selected = () =>
    props.personas.find((persona) => persona.personaId === props.selectedPersonaId);
  const canChoose = () => !props.disabled && props.personas.length > 1;

  const identity = (persona: OperationPersona | undefined) => (
    <>
      <Avatar
        class="size-6 border-0 bg-card text-base"
        fallback={persona?.displayName ?? props.label}
        src={persona?.avatarSrc ?? undefined}
      />
      <Type as="span" class="min-w-0 truncate" variant="body-strong">
        {persona?.displayName ?? props.placeholder ?? ""}
      </Type>
    </>
  );

  return (
    <div class={cn("flex min-w-0 items-center gap-2", props.class)} data-operation-persona>
      <Type as="span" class="shrink-0" variant="caption">
        {props.label}
      </Type>
      <Show
        when={canChoose()}
        fallback={
          <span class="flex min-w-0 items-center gap-2" data-operation-persona-static>
            {identity(selected())}
          </span>
        }
      >
        <Modal forceMobile={props.forceMobile} onOpenChange={setOpen} open={open()}>
          <button
            aria-haspopup="dialog"
            class={cn(pillButtonVariants({ tone: "default" }), "min-w-0 gap-2 px-3 text-foreground")}
            onClick={() => setOpen(true)}
            type="button"
          >
            {identity(selected())}
            <IconCaretDown class="size-4 shrink-0" />
          </button>
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
              onChange={(personaId) => {
                props.onSelect?.(personaId);
                setOpen(false);
              }}
              value={selected()?.personaId}
            >
              <For each={props.personas}>
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
            </OptionCardGroup>
          </ModalContent>
        </Modal>
      </Show>
    </div>
  );
}
