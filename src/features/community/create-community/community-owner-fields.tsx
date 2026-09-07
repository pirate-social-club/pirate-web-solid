import { For, Show, createSignal, createUniqueId } from "solid-js";
import type { ActivePersonaPublicProjection } from "../../../api/session";
import { Button, TextField, TextFieldInput, TextFieldLabel, Type } from "../../../design-system";
import { communityCreationCandidates } from "../../identity/community-persona-choice";
import type { CreateCommunityDraft } from "./create-community-model";

export function CommunityOwnerFields(props: {
  draft: CreateCommunityDraft;
  personas?: readonly ActivePersonaPublicProjection[];
  profilesUnavailable?: boolean;
  onChange?: (patch: Partial<CreateCommunityDraft>) => void;
}) {
  const id = createUniqueId();
  const [choosingExisting, setChoosingExisting] = createSignal(false);
  const candidates = () => communityCreationCandidates(props.personas ?? []);
  const existing = () => {
    const choice = props.draft.persona;
    return choice?.kind === "existing" ? candidates().find(profile => profile.personaId === choice.personaId) : undefined;
  };
  const useExisting = () => {
    const only = candidates().length === 1 ? candidates()[0] : undefined;
    if (only) props.onChange?.({ persona: { kind: "existing", personaId: only.personaId } });
    else { setChoosingExisting(true); props.onChange?.({ persona: undefined }); }
  };
  return (
    <section aria-labelledby={`owner-${id}`} class="flex flex-col gap-3 border-t border-border-soft pt-5">
      <Type as="h2" id={`owner-${id}`} variant="body-strong">Your profile here</Type>
      <Show when={props.draft.persona?.kind === "existing" || choosingExisting()} fallback={
        <>
          <TextField required value={props.draft.publicName ?? ""} onChange={publicName => props.onChange?.({ publicName })}>
            <TextFieldLabel>Public name</TextFieldLabel>
            <TextFieldInput maxlength={80} aria-describedby={`owner-help-${id}`} class="rounded-[var(--radius-lg)] bg-card" />
          </TextField>
          <p id={`owner-help-${id}`} class="text-sm text-muted-foreground">This name appears on your posts in this community. Your new profile stays with this community.</p>
          <Show when={candidates().length > 0}>
            <Button type="button" variant="ghost" class="self-start" disabled={props.profilesUnavailable} onClick={useExisting}>Use an existing profile</Button>
          </Show>
        </>
      }>
        <Show when={existing()} fallback={
          <div class="flex flex-col gap-2">
            <label for={`owner-choice-${id}`}>Public profile</label>
            <select id={`owner-choice-${id}`} class="rounded-lg border border-border-soft bg-card p-3" disabled={props.profilesUnavailable} value={props.draft.persona?.kind === "existing" ? props.draft.persona.personaId : ""} onChange={event => {
              props.onChange?.({ persona: { kind: "existing", personaId: event.currentTarget.value } });
              setChoosingExisting(false);
            }}>
              <option value="" disabled>Choose a profile</option>
              <For each={candidates()}>{profile => <option value={profile.personaId}>{profile.displayName}</option>}</For>
            </select>
          </div>
        }>{profile => <Type as="p" variant="body">Creating as {profile().displayName}</Type>}</Show>
        <p class="text-sm text-muted-foreground">This profile becomes permanently linked to this community.</p>
        <Button type="button" variant="ghost" class="self-start" onClick={() => {
          setChoosingExisting(false);
          props.onChange?.({ persona: { kind: "create_new" } });
        }}>Create a new profile instead</Button>
      </Show>
    </section>
  );
}
