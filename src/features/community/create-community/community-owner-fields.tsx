import { For, Show, createSignal, createUniqueId } from "solid-js";
import type { ActivePersonaPublicProjection } from "../../../api/session";
import { Button, TextField, TextFieldInput, TextFieldLabel, Type } from "../../../design-system";
import { communityCreationCandidates } from "../../identity/community-persona-choice";
import type { CreateCommunityCopy, CreateCommunityDraft } from "./create-community-model";

/** The localized strings this section renders; supplied by the creation view. */
export type CommunityOwnerCopy = Pick<
  CreateCommunityCopy,
  | "ownerHeading"
  | "ownerPublicNameLabel"
  | "ownerPublicNameHelp"
  | "ownerUseExisting"
  | "ownerExistingLabel"
  | "ownerExistingPlaceholder"
  | "ownerCreatingAs"
  | "ownerLinkedWarning"
  | "ownerNewInstead"
>;

export function CommunityOwnerFields(props: {
  draft: CreateCommunityDraft;
  copy: CommunityOwnerCopy;
  personas?: readonly ActivePersonaPublicProjection[];
  profilesUnavailable?: boolean;
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
      <Type as="h2" id={`owner-${id}`} variant="body-strong">{props.copy.ownerHeading}</Type>
      <Show when={props.draft.persona?.kind === "existing" || choosingExisting()} fallback={
        <>
          <TextField required value={props.draft.publicName ?? ""} onChange={publicName => props.onChange?.({ publicName })}>
            <TextFieldLabel>{props.copy.ownerPublicNameLabel}</TextFieldLabel>
            <TextFieldInput maxlength={80} aria-describedby={`owner-help-${id}`} class="rounded-[var(--radius-lg)] bg-card" />
          </TextField>
          <p id={`owner-help-${id}`} class="text-sm text-muted-foreground">{props.copy.ownerPublicNameHelp}</p>
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
    </section>
  );
}
