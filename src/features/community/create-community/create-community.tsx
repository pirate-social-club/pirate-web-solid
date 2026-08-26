/** @jsxImportSource @solidjs/web */

import { For, Show, createSignal, createUniqueId } from "solid-js";
import type { JSX } from "@solidjs/web";

import {
  Button,
  CheckboxCard,
  FormNote,
  IconGlobe,
  IconHandPalm,
  IconShield,
  MediaUploadField,
  OptionCard,
  OptionCardGroup,
  TextField,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
  Textarea,
  Type,
  cn,
} from "../../../design-system";
import { getLocaleMessages } from "../../../locales";
import { useUiLocale } from "../../../lib/ui-locale";
import {
  OperationPersonaControl,
  type OperationPersona,
} from "../../identity/operation-persona-control/operation-persona-control";
import {
  hasRequirement,
  JOIN_POLICY_CHOICES,
  requirementsEqual,
  validateDraft,
  type AdvancedGateOption,
  type CreateCommunityCopy,
  type CreateCommunityDraft,
  type GateRequirement,
  type JoinPolicyChoice,
} from "./create-community-model";

export interface CreateCommunityProps {
  class?: string;
  draft: CreateCommunityDraft;
  /**
   * Advanced gates the backend capability catalog offers this operator. Spec
   * 010 §2 hides unsupported gates in production, so an empty list hides the
   * Advanced choice entirely rather than showing it disabled.
   */
  advancedGateOptions?: readonly AdvancedGateOption[];
  personas?: readonly OperationPersona[];
  onPersonaChange?: (personaId: string) => void;
  /** Server-supplied name error, e.g. a rejected commit. */
  nameError?: string | null;
  avatarSrc?: string | null;
  coverSrc?: string | null;
  onAvatarChange?: (file: File | null) => void;
  onCoverChange?: (file: File | null) => void;
  onDraftChange?: (patch: Partial<CreateCommunityDraft>) => void;
  onJoinPolicyChange?: (choice: JoinPolicyChoice) => void;
  onAdvancedRequirementsChange?: (requirements: GateRequirement[]) => void;
  onSubmit?: () => void;
  submitting?: boolean;
  forceMobile?: boolean;
}

const joinPolicyIcon = {
  everyone: () => <IconGlobe class="size-6" />,
  verified: () => <IconHandPalm class="size-6" />,
  advanced: () => <IconShield class="size-6" />,
} satisfies Record<JoinPolicyChoice, () => JSX.Element>;

export function CreateCommunityView(props: CreateCommunityProps) {
  // Read the locale once at setup: the context value is a plain code, not a
  // signal, and deferring the read means event handlers would call useContext
  // outside a reactive owner.
  const locale = useUiLocale();
  // SAFETY: the generated routes catalog guarantees the createCommunity key shape for every UI locale.
  const copy = () => getLocaleMessages(locale, "routes").createCommunity as CreateCommunityCopy;

  const fieldId = createUniqueId();
  const joinPolicyLabelId = `create-community-join-policy-${fieldId}`;
  const descriptionId = `create-community-description-${fieldId}`;
  const advancedErrorId = `create-community-advanced-error-${fieldId}`;

  const [nameTouched, setNameTouched] = createSignal(false);
  const validation = () => validateDraft(props.draft, copy());
  const visibleNameError = () =>
    props.nameError ?? (nameTouched() ? validation().nameError : null);
  // Stay neutral until the field is touched or the server rejects it, rather
  // than telling the user an untouched empty field is already valid.
  const nameValidationState = () => (visibleNameError() ? "invalid" as const : nameTouched() ? "valid" as const : undefined);
  const advancedOptions = () => props.advancedGateOptions ?? [];
  const isAdvanced = () => props.draft.joinPolicy === "advanced";
  const advancedError = () => (isAdvanced() ? validation().advancedError : null);
  const canSubmit = () => validation().valid && !props.submitting;

  const choices = () => {
    const base: JoinPolicyChoice[] = ["everyone", "verified"];
    return advancedOptions().length > 0 ? [...base, "advanced" as const] : base;
  };

  const choiceCopy = (choice: JoinPolicyChoice) => {
    const messages = copy();
    switch (choice) {
      case "everyone":
        return { title: messages.everyoneTitle, description: messages.everyoneDescription };
      case "verified":
        return {
          title: messages.verifiedTitle,
          description: `${messages.verifiedRecommended} \u00b7 ${messages.verifiedDescription}`,
        };
      case "advanced":
        return { title: messages.advancedTitle, description: messages.advancedDescription };
    }
  };

  const isSelected = (requirement: GateRequirement) =>
    hasRequirement(props.draft.advancedRequirements, requirement);

  const toggleGate = (requirement: GateRequirement, checked: boolean) => {
    const without = props.draft.advancedRequirements.filter(
      (entry) => !requirementsEqual(entry, requirement),
    );
    props.onAdvancedRequirementsChange?.(checked ? [...without, requirement] : without);
  };

  return (
    <section
      class={cn("mx-auto flex w-full max-w-2xl flex-col gap-6", props.class)}
      data-create-community
    >
      <header class="flex flex-wrap items-center justify-between gap-3">
        <Type as="h1" variant="h1">{copy().title}</Type>
        <Show when={props.personas?.length ? props.personas : undefined}>
          {(personas) => (
            <OperationPersonaControl
              disabled={props.submitting}
              forceMobile={props.forceMobile}
              label={copy().personaLabel}
              onSelect={props.onPersonaChange}
              personas={personas()}
              selectedPersonaId={props.draft.personaId}
            />
          )}
        </Show>
      </header>

      <form class="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); if (canSubmit()) props.onSubmit?.(); }}>
        {/* Kobalte's TextField exposes no blur hook, so the wrapper marks the
            field touched when focus leaves it. */}
        <div onFocusOut={() => setNameTouched(true)}>
          <TextField
            onChange={(value) => {
              setNameTouched(true);
              props.onDraftChange?.({ name: value });
            }}
            required
            validationState={nameValidationState()}
            value={props.draft.name}
          >
            <TextFieldLabel>{copy().nameLabel}</TextFieldLabel>
            <TextFieldInput
              class="rounded-[var(--radius-lg)] bg-card"
              placeholder={copy().namePlaceholder}
            />
            <TextFieldErrorMessage>{visibleNameError()}</TextFieldErrorMessage>
          </TextField>
        </div>

        <div class="flex flex-col gap-2">
          <label for={descriptionId}>
            <Type variant="label">{copy().descriptionLabel}</Type>
          </label>
          <Textarea
            class="h-20 min-h-20 resize-none rounded-[var(--radius-lg)] bg-card px-3 py-2"
            id={descriptionId}
            onInput={(event) => props.onDraftChange?.({
              description: event.currentTarget.value === "" ? null : event.currentTarget.value,
            })}
            placeholder={copy().descriptionPlaceholder}
            rows={3}
            value={props.draft.description ?? ""}
          />
        </div>

        <fieldset class="flex flex-col gap-2" data-community-join-policy>
          <legend class="mb-1" id={joinPolicyLabelId}>
            <Type as="span" variant="body-strong">{copy().joinPolicyTitle}</Type>
          </legend>
          <OptionCardGroup
            labelledBy={joinPolicyLabelId}
            onChange={(value) => {
              const choice = JOIN_POLICY_CHOICES.find((entry) => entry === value);
              if (choice) props.onJoinPolicyChange?.(choice);
            }}
            value={props.draft.joinPolicy}
          >
            <For each={choices()}>
              {(choice) => (
                <OptionCard
                  description={choiceCopy(choice).description}
                  icon={joinPolicyIcon[choice]()}
                  title={choiceCopy(choice).title}
                  value={choice}
                />
              )}
            </For>
          </OptionCardGroup>

          <Show when={isAdvanced()}>
            <ul aria-describedby={advancedError() ? advancedErrorId : undefined} aria-label={copy().advancedLabel} class="ms-3 flex flex-col gap-2 border-s border-border-soft ps-4">
              <For each={advancedOptions()}>
                {(option) => (
                  <li>
                    <CheckboxCard
                      checked={isSelected(option.requirement)}
                      description={option.description}
                      onCheckedChange={(checked: boolean) => toggleGate(option.requirement, checked)}
                      title={option.label}
                    />
                  </li>
                )}
              </For>
            </ul>
            <Show when={advancedError()}>
              <div id={advancedErrorId} role="alert">
                <FormNote tone="destructive">{advancedError()}</FormNote>
              </div>
            </Show>
          </Show>
        </fieldset>

        <MediaUploadField
          chooseLabel={copy().coverChoose}
          clearLabel={copy().removeImage}
          hideLabel
          label={copy().coverLabel}
          onChange={props.onCoverChange}
          onClear={() => props.onCoverChange?.(null)}
          previewSrc={props.coverSrc}
          replaceLabel={copy().coverReplace}
          frame="banner"
        />

        <MediaUploadField
          chooseLabel={copy().avatarChoose}
          clearLabel={copy().removeImage}
          fallbackLabel={initialsOf(props.draft.name)}
          label={copy().avatarLabel}
          onChange={props.onAvatarChange}
          onClear={() => props.onAvatarChange?.(null)}
          previewSrc={props.avatarSrc}
          replaceLabel={copy().avatarReplace}
          frame="circle"
        />

        <footer class="sticky bottom-0 z-10 -mx-1 border-t border-border-soft bg-background px-1 pb-4 pt-3" data-create-community-footer>
          <Button class="h-14 w-full" disabled={!canSubmit()} loading={props.submitting} type="submit">
            {copy().submit}
          </Button>
        </footer>
      </form>
    </section>
  );
}

/** Initials for the avatar placeholder; empty until the community is named. */
function initialsOf(name: string): string {
  const chunks = name.trim().split(/\s+/).filter(Boolean);
  if (chunks.length === 0) return "";
  if (chunks.length === 1) return chunks[0]!.slice(0, 2).toUpperCase();
  return `${chunks[0]![0] ?? ""}${chunks[1]![0] ?? ""}`.toUpperCase();
}

export const CreateCommunity = CreateCommunityView;
