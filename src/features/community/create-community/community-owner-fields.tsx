import { For, Show, createSignal, createUniqueId } from "solid-js";
import type { ActivePersonaPublicProjection } from "../../../api/session";
import { Button, TextField, TextFieldInput, TextFieldLabel, Type, cn } from "../../../design-system";
import { communityCreationCandidates } from "../../identity/community-persona-choice";
import type { CreateCommunityCopy, CreateCommunityDraft } from "./create-community-model";
import { generatedAvatarSrc, randomAvatarSeed } from "./generated-avatar";

/** The localized strings this section renders; supplied by the creation view. */
export type CommunityOwnerCopy = Pick<
  CreateCommunityCopy,
  | "ownerHeading"
  | "profileScope"
  | "ownerPublicNameLabel"
  | "ownerUseExisting"
  | "ownerExistingLabel"
  | "ownerExistingPlaceholder"
  | "ownerCreatingAs"
  | "ownerLinkedWarning"
  | "ownerNewInstead"
  | "ownerAvatarLabel"
  | "ownerAvatarShuffle"
  | "avatarReplace"
>;

export function CommunityOwnerFields(props: {
  draft: CreateCommunityDraft;
  copy: CommunityOwnerCopy;
  personas?: readonly ActivePersonaPublicProjection[];
  profilesUnavailable?: boolean;
  /** Chosen profile-avatar image; the generated default shows when absent. */
  profileAvatarSrc?: string | null;
  onProfileAvatarChange?: (file: File | null) => void;
  /**
   * Hides the section heading when the page header already carries its text.
   * The heading element stays in the DOM as the section's accessible name;
   * it is never removed.
   */
  hideHeading?: boolean;
  /**
   * A saved intent freezes the owner choice. Locked renders one summary line
   * instead of disabled form controls: a control that cannot be used is
   * noise, and the line says the same thing.
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
    <section aria-labelledby={`owner-${id}`} class="flex flex-col gap-3 border-t border-border-soft pt-5">
      <Type as="h2" id={`owner-${id}`} variant="body-strong" class={cn(props.hideHeading && "sr-only")}>{props.copy.ownerHeading}</Type>
      <Show when={props.locked} fallback={
        <Show when={props.draft.persona?.kind === "existing" || choosingExisting()} fallback={
          <>
            {/*
              Spec 014 §3.1: the profile avatar is optional, and when no image
              is chosen a default is generated locally from a random seed the
              owner may shuffle. It is never derived from the Public name. One
              labelled file input carries the picker; the preview opens it and
              real buttons replace or shuffle, so no label-to-input name leak
              and no always-on remove control.
            */}
            <div class="flex items-center gap-4">
              {/* Visual preview only: clicking it opens the picker, but the
                  labelled input and the real buttons carry the semantics, so
                  the label stays out of the accessibility tree. */}
              <label
                aria-hidden="true"
                class="block size-[4.5rem] shrink-0 cursor-pointer overflow-hidden rounded-full border border-border-soft bg-card transition-colors hover:border-primary/40"
                for={`owner-avatar-${id}`}
              >
                <img alt="" class="size-full object-cover" src={props.profileAvatarSrc ?? generatedAvatarSrc(props.draft.profileAvatarSeed)} />
              </label>
              <input
                accept="image/*"
                aria-label={props.copy.ownerAvatarLabel}
                class="sr-only"
                id={`owner-avatar-${id}`}
                onChange={(event) => {
                  props.onProfileAvatarChange?.(event.currentTarget.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
              <div class="flex flex-col items-start gap-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById(`owner-avatar-${id}`)?.click()}
                >
                  {props.copy.avatarReplace}
                </Button>
                <Show when={!props.profileAvatarSrc}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => props.onChange?.({ profileAvatarSeed: randomAvatarSeed() })}
                  >
                    {props.copy.ownerAvatarShuffle}
                  </Button>
                </Show>
              </div>
            </div>
            <TextField required value={props.draft.publicName ?? ""} onChange={publicName => props.onChange?.({ publicName })}>
              <TextFieldLabel>{props.copy.ownerPublicNameLabel}</TextFieldLabel>
              <TextFieldInput aria-describedby={`owner-scope-${id}`} maxlength={80} class="rounded-[var(--radius-lg)] bg-card" />
            </TextField>
            {/* The spec-mandated per-community fact, attached to the field it
                explains instead of floating under the header. */}
            <p class="text-sm text-muted-foreground" id={`owner-scope-${id}`}>{props.copy.profileScope}</p>
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
