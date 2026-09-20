import { For, Show, createSignal, createUniqueId } from "solid-js";
import type { ActivePersonaPublicProjection } from "../../../api/session";
import { Button, TextField, TextFieldInput, TextFieldLabel, Type, cn } from "../../../design-system";
import { communityCreationCandidates } from "../../identity/community-persona-choice";
import type { CreateCommunityCopy, CreateCommunityDraft } from "./create-community-model";
import { generatedAvatarSrc } from "./generated-avatar";
import { MediaPicker } from "./media-picker";

/** The localized strings this section renders; supplied by the creation view. */
export type CommunityOwnerCopy = Pick<
  CreateCommunityCopy,
  | "ownerHeading"
  | "ownerPublicNameLabel"
  | "ownerUseExisting"
  | "ownerExistingLabel"
  | "ownerExistingPlaceholder"
  | "ownerCreatingAs"
  | "ownerLinkedWarning"
  | "ownerNewInstead"
  | "ownerAvatarLabel"
  | "mediaPrompt"
  | "mediaChooseFile"
  | "mediaReplace"
  | "mediaRemove"
  | "profileAvatarHelp"
>;

export function CommunityOwnerFields(props: {
  draft: CreateCommunityDraft;
  copy: CommunityOwnerCopy;
  personas?: readonly ActivePersonaPublicProjection[];
  profilesUnavailable?: boolean;
  onProfileAvatarChange?: (file: File | null) => void;
  /**
   * Hides the section heading when the page header already carries its text.
   * The heading element stays in the DOM as the section's accessible name;
   * it is never removed.
   */
  hideHeading?: boolean;
  /**
   * A saved intent freezes the owner choice. Locked renders one summary line
   * instead of form controls: a control that cannot be used is noise, and
   * the line says the same thing.
   */
  locked?: boolean;
  onChange?: (patch: Partial<CreateCommunityDraft>) => void;
}) {
  const id = createUniqueId();
  const [choosingExisting, setChoosingExisting] = createSignal(false);
  const candidates = () => communityCreationCandidates(props.personas ?? []);
  const existing = () => {
    const choice = props.draft.persona;
    return choice?.kind === "existing" ? (props.personas ?? []).find(profile => profile.personaId === choice.personaId) : undefined;
  };
  const useExisting = () => {
    const only = candidates().length === 1 ? candidates()[0] : undefined;
    if (only) props.onChange?.({ persona: { kind: "existing", personaId: only.personaId } });
    else { setChoosingExisting(true); props.onChange?.({ persona: undefined }); }
  };
  return (
    <section aria-labelledby={`owner-${id}`} class="flex flex-col gap-3">
      <Type as="h2" id={`owner-${id}`} variant="body-strong" class={cn(props.hideHeading && "sr-only")}>{props.copy.ownerHeading}</Type>
      <Show when={props.locked} fallback={
        <Show when={props.draft.persona?.kind === "existing" || choosingExisting()} fallback={
        <>
          {/*
            Spec 014 §3.1 as amended 2026-09-20: the profile avatar is
            optional, generated locally by default (shown inside the picker
            region), uploaded through the same MediaPicker shape. The name
            field is titled "Name in this community" and arrives prefilled
            with a locally generated suggestion.
          */}
          <TextField required value={props.draft.publicName ?? ""} onChange={publicName => props.onChange?.({ publicName })}>
            <TextFieldLabel>{props.copy.ownerPublicNameLabel}</TextFieldLabel>
            <TextFieldInput maxlength={80} class="rounded-[var(--radius-lg)] bg-card" />
          </TextField>
          <MediaPicker
            chooseLabel={props.copy.mediaChooseFile}
            fallback={<img alt="" class="size-10 shrink-0 rounded-full object-cover" src={generatedAvatarSrc(props.draft.profileAvatarSeed)} />}
            help={props.copy.profileAvatarHelp}
            label={props.copy.ownerAvatarLabel}
            prompt={props.copy.mediaPrompt}
            removeLabel={props.copy.mediaRemove}
            replaceLabel={props.copy.mediaReplace}
            onSelect={file => props.onProfileAvatarChange?.(file)}
          />
          <div class="h-10">
            <Button type="button" variant="ghost" class={candidates().length === 0 ? "invisible self-start" : "self-start"} disabled={props.profilesUnavailable || candidates().length === 0} onClick={useExisting}>{props.copy.ownerUseExisting}</Button>
          </div>
        </>
      }>
        <Show when={existing()} fallback={
          <div class="flex flex-col gap-2">
            <label for={`owner-choice-${id}`}>{props.copy.ownerExistingLabel}</label>
            <select id={`owner-choice-${id}`} class="rounded-lg border border-border-soft bg-card p-3" disabled={props.profilesUnavailable} value={props.draft.persona?.kind === "existing" ? props.draft.persona.personaId : ""} onChange={event => {
              props.onChange?.({ persona: { kind: "existing", personaId: event.currentTarget.value } });
              setChoosingExisting(false);
            }}>
              <option value="" disabled>{props.copy.ownerExistingPlaceholder}</option>
              <For each={candidates()}>{profile => <option value={profile.personaId}>{profile.displayName}</option>}</For>
            </select>
          </div>
        }>{profile => <Type as="p" variant="body">{props.copy.ownerCreatingAs.replace("{name}", profile().displayName ?? "")}</Type>}</Show>
        <p class="text-sm text-muted-foreground">{props.copy.ownerLinkedWarning}</p>
        <Button type="button" variant="ghost" class="self-start" onClick={() => {
          setChoosingExisting(false);
          props.onChange?.({ persona: { kind: "create_new" } });
        }}>{props.copy.ownerNewInstead}</Button>
      </Show>
      }>
        <Type as="p" variant="body">{props.copy.ownerCreatingAs.replace("{name}", existing()?.displayName ?? props.draft.publicName ?? "")}</Type>
      </Show>
    </section>
  );
}
