/** @jsxImportSource @solidjs/web */

import type { ActivePersonaPublicProjection } from "../../../api/session";
import { CommunityOwnerFields } from "./community-owner-fields";
import { JoinPolicyField, type JoinPolicyKind } from "./join-policy-field";
import { MediaPicker } from "./media-picker";
import { Show, createEffect, createSignal, createUniqueId } from "solid-js";

import {
  ActionFooterShell,
  Button,
  IconButton,
  IconArrowLeft,
  IconImageSquare,
  IconX,
  TextField,
  TextFieldErrorMessage,
  TextFieldInput,
  TextFieldLabel,
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
  onAvatarChange?: (file: File | null) => void;
  onProfileAvatarChange?: (file: File | null) => void;
  onDraftChange?: (patch: Partial<CreateCommunityDraft>) => void;
  onSubmit?: () => void;
  onClose?: () => void;
  personas?: readonly ActivePersonaPublicProjection[];
  profilesUnavailable?: boolean;
  /** Page the flow opens on; production always starts at one. */
  initialStep?: 1 | 2 | 3;
  /**
   * Offers the document-nationality join policy, which adds the "Who can
   * join?" page. While it is off, creation is the details page then the
   * profile page and the Palm fact lives in the details preview.
   */
  nationalityAuthoring?: boolean;
  submitting?: boolean;
  /** A blocked creation intent keeps Create disabled without a loading state. */
  submitDisabled?: boolean;
  fieldsDisabled?: boolean;
  ownerDisabled?: boolean;
  failureMessage?: string;
  onRetry?: () => void;
  retryLabel?: string;
  accountChecking?: boolean;
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

  const [nameTouched, setNameTouched] = createSignal(false);
  const validation = () => validateDraft(props.draft, copy());
  const visibleNameError = () =>
    props.nameError ?? (nameTouched() ? validation().nameError : null);
  // Stay neutral until the field is touched or the server rejects it, rather
  // than telling the user an untouched empty field is already valid.
  const nameValidationState = () => (visibleNameError() ? "invalid" as const : nameTouched() ? "valid" as const : undefined);
  const nationality = () => props.draft.additionalRequirements.find(value => value.requirement === "nationality-allowed");
  const nationalityValid = () => nationality() === undefined || (nationality()?.allowedCountries.length ?? 0) > 0;
  const canSubmit = () => nationalityValid() && validation().nameError === null
    && validation().personaError === null && validation().publicNameError === null
    && !props.submitting && !props.accountChecking && !props.submitDisabled;

  // Two pages (Spec 006 as amended 2026-09-20): details — avatar, name,
  // description, join policy — then profile. No page writes an intent; the
  // route view only persists on the final submit, which lives on the profile
  // page.
  // SAFETY: the flow has exactly two pages, so the clamped seed is 1 or 2.
  const [step, setStep] = createSignal<1 | 2 | 3>(Math.min(props.initialStep ?? 1, 2) as 1 | 2 | 3);
  const isProfilePage = () => step() === 2;
  const stepOneReady = () => nationalityValid() && validation().nameError === null
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
      // Only the submit path may surface the blocked-Continue error; the
      // readiness check below must stay pure, or the footer writes reactive
      // state during render.
      setPolicyAttempted(true);
      return false;
    }
    return true;
  };
  // A rejected commit belongs to the community fields, so show them again.
  createEffect(() => props.nameError, (nameError) => { if (nameError) setStep(1); });

  // Each page titles itself in the header, like the post flow's review step.
  const stepTitle = () => isProfilePage() ? copy().ownerHeading : copy().title;
  const backLabel = () => copy().backToDetails;

  return (
    <form
      class={cn("h-full", props.class)}
      novalidate
      data-create-community
      onSubmit={(event) => {
        event.preventDefault();
        if (!isProfilePage()) {
          if (continueFromPolicy() && stepOneReady()) setStep(2);
          return;
        }
        if (canSubmit()) props.onSubmit?.();
      }}
    >
      <ActionFooterShell
        bodyClass="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-5"
        footer={
          <div class="mx-auto w-full max-w-2xl">
            {/* The failure area renders only when there is something to say;
                a fixed empty slot padded the footer for nothing. */}
            <Show when={props.failureMessage || props.onRetry}>
              <div class="max-h-20 overflow-auto text-sm text-destructive-text" data-creation-feedback>
                <p role="alert">{props.failureMessage}</p>
                <Show when={props.onRetry}><Button type="button" variant="ghost" disabled={props.accountChecking || props.submitting} onClick={props.onRetry}>{props.retryLabel ?? copy().tryAgain}</Button></Show>
              </div>
            </Show>
            <Show
              when={!isProfilePage()}
              fallback={
                <Button class="h-11 w-full" disabled={!canSubmit()} loading={props.submitting || props.accountChecking} type="submit">
                  {props.submitLabel ?? copy().submit}
                </Button>
              }
            >
              {/* A submit-typed Continue keeps Enter meaningful on every
                  page; the form's onSubmit routes by page. */}
              <Button
                class="h-11 w-full"
                disabled={!stepOneReady()}
                type="submit"
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
                when={step() > 1}
                fallback={<span aria-hidden="true" class="size-10" />}
              >
                <IconButton
                  aria-label={backLabel()}
                  onClick={() => /* SAFETY: only page two has a back arrow. */ setStep((step() - 1) as 1 | 2 | 3)}
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
        <Show when={!isProfilePage()}>
        {/* Spec 006 as amended 2026-09-20: the details page carries the
            community avatar, name, description and the join policy as one
            section. A cover banner is outside creation, and there is no
            preview card. */}
        <div class="flex flex-col gap-5">
          <MediaPicker
            chooseLabel={copy().mediaChooseFile}
            fallback={<IconImageSquare class="size-12 shrink-0 text-muted-foreground" />}
            help={copy().avatarHelp}
            label={copy().avatarLabel}
            prompt={copy().mediaPrompt}
            removeLabel={copy().mediaRemove}
            replaceLabel={copy().mediaReplace}
            onSelect={file => props.onAvatarChange?.(file)}
          />

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

          <JoinPolicyField
            allowNationality={props.nationalityAuthoring === true}
            copy={{
              title: copy().joinPolicyTitle,
              palmTitle: copy().joinPolicyPalmTitle,
              nationalityTitle: copy().joinPolicyNationalityTitle,
              statement: copy().joinPolicyStatement,
              pickerLabel: copy().nationalityPickerLabel,
              pickerPlaceholder: copy().nationalityPickerPlaceholder,
              removeCountry: copy().removeCountry,
              emptyError: copy().nationalityEmptyError,
            }}
            countries={nationality()?.allowedCountries ?? []}
            locale={locale}
            onCountriesChange={setCountries}
            onPolicyChange={setJoinPolicy}
            policy={joinPolicyKind()}
            showEmptyError={policyAttempted() || policyTouched()}
          />
        </div>
        </Show>

        <Show when={isProfilePage()}>
        <CommunityOwnerFields
          copy={copy()}
          draft={props.draft}
          hideHeading
          locked={props.ownerDisabled}
          onProfileAvatarChange={props.onProfileAvatarChange}
          personas={props.personas}
          profilesUnavailable={props.profilesUnavailable}
          onChange={props.onDraftChange}
        />
        </Show>
        </fieldset>
      </ActionFooterShell>
    </form>
  );
}

export const CreateCommunity = CreateCommunityView;
