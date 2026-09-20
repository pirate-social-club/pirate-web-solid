/** @jsxImportSource @solidjs/web */

import type { ActivePersonaPublicProjection } from "../../../api/session";
import { CommunityOwnerFields } from "./community-owner-fields";
import { JoinPolicyField, type JoinPolicyKind } from "./join-policy-field";
import { Show, createEffect, createSignal, createUniqueId } from "solid-js";

import {
  ActionFooterShell,
  Button,
  IconButton,
  IconArrowLeft,
  IconX,
  MediaUploadField,
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
  validateDraft,
  type CreateCommunityCopy,
  type CreateCommunityDraft,
} from "./create-community-model";

export interface CreateCommunityProps {
  class?: string;
  draft: CreateCommunityDraft;
  /** Server-supplied name error, e.g. a rejected commit. */
  nameError?: string | null;
  avatarSrc?: string | null;
  coverSrc?: string | null;
  onAvatarChange?: (file: File | null) => void;
  onCoverChange?: (file: File | null) => void;
  onDraftChange?: (patch: Partial<CreateCommunityDraft>) => void;
  onSubmit?: () => void;
  onClose?: () => void;
  personas?: readonly ActivePersonaPublicProjection[];
  profilesUnavailable?: boolean;
  /** Keep false in production until the community API can persist these assets. */
  showMediaFields?: boolean;
  /** Enables the three-page layout. The route view flips this on with its tests. */
  steps?: boolean;
  /**
   * Resuming a saved intent keeps the frozen single-surface shape; the three
   * pages are only for a creation that has not written an intent yet.
   */
  resuming?: boolean;
  /**
   * Offers the document-nationality join policy. The route view passes the
   * fetched authoring context once the API exposes it; until then the option
   * stays hidden and only the Palm policy can be authored.
   */
  nationalityAuthoring?: boolean;
  submitting?: boolean;
  /** A blocked creation intent keeps Create disabled without a loading state. */
  submitDisabled?: boolean;
  fieldsDisabled?: boolean;
  ownerDisabled?: boolean;
  actionOnly?: boolean;
  failureMessage?: string;
  onRetry?: () => void;
  retryLabel?: string;
  accountChecking?: boolean;
  requirePersona?: boolean;
  submitLabel?: string;
  forceMobile?: boolean;
}

export function CreateCommunityView(props: CreateCommunityProps) {
  // Read the locale once at setup: the context value is a plain code, not a
  // signal, and deferring the read means event handlers would call useContext
  // outside a reactive owner.
  const locale = useUiLocale();
  // SAFETY: the generated routes catalog guarantees the createCommunity key shape for every UI locale.
  const copy = () => getLocaleMessages(locale, "routes").createCommunity as CreateCommunityCopy;

  const fieldId = createUniqueId();
  const descriptionId = `create-community-description-${fieldId}`;

  const [nameTouched, setNameTouched] = createSignal(false);
  const validation = () => validateDraft(props.draft, copy());
  const visibleNameError = () =>
    props.nameError ?? (nameTouched() ? validation().nameError : null);
  // Stay neutral until the field is touched or the server rejects it, rather
  // than telling the user an untouched empty field is already valid.
  const nameValidationState = () => (visibleNameError() ? "invalid" as const : nameTouched() ? "valid" as const : undefined);
  const nationality = () => props.draft.additionalRequirements.find(value => value.requirement === "nationality-allowed");
  const nationalityValid = () => nationality() === undefined || (nationality()?.allowedCountries.length ?? 0) > 0;
  const canSubmit = () => (props.actionOnly || (nationalityValid() && validation().nameError === null
    && (props.requirePersona === false || (validation().personaError === null && validation().publicNameError === null))
    )) && !props.submitting && !props.accountChecking && !props.submitDisabled;

  // Three-page creation: details, "Who can join?", profile. No page writes an
  // intent; the route view only persists on the final submit, which lives on
  // the profile page. A saved intent and the signed-out surface keep the
  // frozen single-surface shape, where the action is available immediately.
  const [step, setStep] = createSignal<1 | 2 | 3>(1);
  const stepped = () => props.steps === true && !props.actionOnly && props.resuming !== true;
  const stepOneReady = () => validation().nameError === null
    && !props.submitting && !props.accountChecking && !props.submitDisabled;
  const [policyTouched, setPolicyTouched] = createSignal(false);
  const [policyAttempted, setPolicyAttempted] = createSignal(false);
  const joinPolicyKind = (): JoinPolicyKind => (nationality() === undefined ? "palm" : "nationality");
  const setJoinPolicy = (kind: JoinPolicyKind) => {
    setPolicyTouched(false);
    setPolicyAttempted(false);
    if (kind === "nationality") {
      if (nationality() !== undefined) return;
      props.onDraftChange?.({
        additionalRequirements: [...props.draft.additionalRequirements, { requirement: "nationality-allowed", allowedCountries: [] }],
      });
    } else {
      props.onDraftChange?.({
        additionalRequirements: props.draft.additionalRequirements.filter(value => value.requirement !== "nationality-allowed"),
      });
    }
  };
  const setCountries = (countries: readonly string[]) => {
    setPolicyTouched(true);
    props.onDraftChange?.({
      additionalRequirements: [...props.draft.additionalRequirements.filter(value => value.requirement !== "nationality-allowed"), { requirement: "nationality-allowed", allowedCountries: [...countries] }],
    });
  };
  const continueFromPolicy = () => {
    if (!nationalityValid()) {
      setPolicyAttempted(true);
      return false;
    }
    return true;
  };
  // A rejected commit belongs to the community fields, so show them again.
  createEffect(() => props.nameError, (nameError) => { if (nameError) setStep(1); });

  // Each stepped page titles itself in the header, like the post flow's review
  // step; the single surface keeps the flow title.
  const stepTitle = () => !stepped() || step() === 1
    ? copy().title
    : step() === 2
      ? copy().joinPolicyTitle
      : copy().ownerHeading;

  return (
    <form
      class={cn("h-full", props.class)}
      novalidate
      data-create-community
      onSubmit={(event) => {
        event.preventDefault();
        if (stepped() && step() === 1) {
          if (stepOneReady()) setStep(2);
          return;
        }
        if (stepped() && step() === 2) {
          if (continueFromPolicy()) setStep(3);
          return;
        }
        if (canSubmit()) props.onSubmit?.();
      }}
    >
      <ActionFooterShell
        bodyClass="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-5"
        footer={
          <div class="mx-auto w-full max-w-2xl">
            <div class="h-20 overflow-auto text-sm text-destructive-text" data-creation-feedback>
              <p role="alert">{props.failureMessage}</p>
              <Show when={props.onRetry}><Button type="button" variant="ghost" disabled={props.accountChecking || props.submitting} onClick={props.onRetry}>{props.retryLabel ?? copy().tryAgain}</Button></Show>
            </div>
            <Show
              when={stepped() && step() < 3}
              fallback={
                <Button class="h-11 w-full" disabled={!canSubmit()} loading={props.submitting || props.accountChecking} type="submit">
                  {props.submitLabel ?? copy().submit}
                </Button>
              }
            >
              <Button
                class="h-11 w-full"
                disabled={step() === 1 ? !stepOneReady() : props.submitting || props.accountChecking}
                onClick={() => { if (step() === 1) { if (stepOneReady()) setStep(2); } else if (continueFromPolicy()) setStep(3); }}
                type="button"
              >
                {copy().continue}
              </Button>
            </Show>
          </div>
        }
        footerClass="px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3"
        header={
          <header class="border-b border-border-soft">
            <div class="mx-auto flex w-full max-w-2xl items-center gap-3 px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
              <Show
                when={stepped() && step() > 1}
                fallback={<span aria-hidden="true" class="size-10" />}
              >
                <IconButton
                  aria-label={step() === 3 ? copy().backToPolicy : copy().backToDetails}
                  onClick={() => setStep(step() === 3 ? 2 : 1)}
                  variant="ghost"
                >
                  <IconArrowLeft class="size-5" />
                </IconButton>
              </Show>
              <Type as="h1" variant="body-strong" class="flex-1 text-center">{stepTitle()}</Type>
              {/*
                Deliberate difference from the video review surface, which has
                no exit: every creation page keeps the close action reachable
                next to the back arrow.
              */}
              <IconButton aria-label={copy().close} onClick={props.onClose} variant="ghost">
                <IconX class="size-5" />
              </IconButton>
            </div>
          </header>
        }
      >
        <fieldset disabled={props.fieldsDisabled || props.submitting} class="contents">
        <Show when={!stepped() || step() === 1}>
        <Show when={props.showMediaFields !== false}>
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
        </Show>

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
        </Show>

        <Show when={!stepped() || step() === 2}>
          <JoinPolicyField
            allowNationality={props.nationalityAuthoring === true}
            copy={{
              title: copy().joinPolicyTitle,
              palmTitle: copy().joinPolicyPalmTitle,
              nationalityTitle: copy().joinPolicyNationalityTitle,
              nationalityHint: copy().nationalityHint,
              pickerLabel: copy().nationalityPickerLabel,
              pickerPlaceholder: copy().nationalityPickerPlaceholder,
              emptyError: copy().nationalityEmptyError,
            }}
            countries={nationality()?.allowedCountries ?? []}
            locale={locale}
            onCountriesChange={setCountries}
            onPolicyChange={setJoinPolicy}
            policy={joinPolicyKind()}
            hideHeading={stepped()}
            showEmptyError={policyAttempted() || policyTouched()}
          />
        </Show>

        {/* No session, no profile section: a signed-out visitor cannot hold a
            persona, so the fields would be inert. After sign-in the stepped
            flow presents the profile page where it belongs. */}
        <Show when={props.requirePersona !== false && (!stepped() || step() === 3)}>
        <CommunityOwnerFields copy={copy()} draft={props.draft} hideHeading={stepped()} locked={props.ownerDisabled} personas={props.personas} profilesUnavailable={props.profilesUnavailable} onChange={props.onDraftChange} />
        </Show>
        </fieldset>
      </ActionFooterShell>
    </form>
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
