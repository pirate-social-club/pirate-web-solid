/** @jsxImportSource @solidjs/web */

import type { ActivePersonaPublicProjection } from "../../../api/session";
import { CommunityOwnerFields } from "./community-owner-fields";
import { Show, createSignal, createUniqueId } from "solid-js";

import {
  ActionFooterShell,
  Button,
  IconHandPalm,
  IconButton,
  IconX,
  ListRow,
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
  submitting?: boolean;
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
  const joinPolicyLabelId = `create-community-join-policy-${fieldId}`;
  const descriptionId = `create-community-description-${fieldId}`;

  const [nameTouched, setNameTouched] = createSignal(false);
  const validation = () => validateDraft(props.draft, copy());
  const visibleNameError = () =>
    props.nameError ?? (nameTouched() ? validation().nameError : null);
  // Stay neutral until the field is touched or the server rejects it, rather
  // than telling the user an untouched empty field is already valid.
  const nameValidationState = () => (visibleNameError() ? "invalid" as const : nameTouched() ? "valid" as const : undefined);
  const canSubmit = () => (props.actionOnly || (validation().nameError === null
    && (props.requirePersona === false || (validation().personaError === null && validation().publicNameError === null))
    )) && !props.submitting && !props.accountChecking;

  return (
    <form
      class={cn("h-full", props.class)}
      novalidate
      data-create-community
      onSubmit={(event) => { event.preventDefault(); if (canSubmit()) props.onSubmit?.(); }}
    >
      <ActionFooterShell
        bodyClass="mx-auto flex w-full max-w-2xl flex-col gap-5 px-5 py-5"
        footer={
          <div class="mx-auto w-full max-w-2xl">
            <div class="h-20 overflow-auto text-sm text-destructive-text" data-creation-feedback>
              <p role="alert">{props.failureMessage}</p>
              <Show when={props.onRetry}><Button type="button" variant="ghost" disabled={props.accountChecking || props.submitting} onClick={props.onRetry}>{props.retryLabel ?? "Try again"}</Button></Show>
            </div>
            <Button class="h-11 w-full" disabled={!canSubmit()} loading={props.submitting || props.accountChecking} type="submit">
              {props.submitLabel ?? copy().submit}
            </Button>
          </div>
        }
        footerClass="px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3"
        header={
          <div class="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-3">
            <Type as="h1" class="text-lg" variant="h4">{copy().title}</Type>
            <IconButton aria-label="Close" onClick={props.onClose} variant="ghost">
              <IconX class="size-5" />
            </IconButton>
          </div>
        }
      >
        <fieldset disabled={props.fieldsDisabled || props.submitting} class="contents">
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

        <Type as="h2" variant="body-strong">Community</Type>

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

        {/*
          Unique-human verification is the only gate offered at creation, and
          it is stated rather than chosen: every community requires it, so a
          control would imply an option that does not exist.
        */}
        <section aria-labelledby={joinPolicyLabelId} class="flex flex-col gap-2" data-community-join-policy>
          <div class="mb-1" id={joinPolicyLabelId}>
            <Type as="span" variant="body-strong">{copy().joinPolicyTitle}</Type>
          </div>
          <ListRow
            description={`${copy().humanVerificationRequired} \u00b7 ${copy().humanVerificationDescription}`}
            leading={<IconHandPalm class="size-6" />}
            title={copy().humanVerificationTitle}
          />

        </section>

        <fieldset class="contents" disabled={props.ownerDisabled}>
        <CommunityOwnerFields draft={props.draft} personas={props.personas} profilesUnavailable={props.profilesUnavailable} onChange={props.onDraftChange} />
        </fieldset>
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
