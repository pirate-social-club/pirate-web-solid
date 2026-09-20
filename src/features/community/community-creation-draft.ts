import { requirementsEqual, type CreateCommunityDraft } from "./create-community/create-community-model";

/** Compare the fields sent by the draft PATCH, independent of revision or lifecycle. */
export function communityCreationDraftsEqual(
  left: CreateCommunityDraft | undefined,
  right: CreateCommunityDraft | undefined,
): boolean {
  if (!left || !right) return false;
  const matches = {
    name: left.name === right.name,
    description: left.description === right.description,
    persona: left.persona?.kind === right.persona?.kind
      && (left.persona?.kind !== "existing"
        || (right.persona?.kind === "existing" && left.persona.personaId === right.persona.personaId)),
    // Public name is sent only for a new persona and is trimmed by the API adapter.
    publicName: left.persona?.kind !== "create_new"
      || (left.publicName?.trim() ?? "") === (right.publicName?.trim() ?? ""),
    additionalRequirements: left.additionalRequirements.length === right.additionalRequirements.length
      && left.additionalRequirements.every((requirement, index) => (
        requirementsEqual(requirement, right.additionalRequirements[index]!)
      )),
    // The generated avatar seed is client-only until the avatar API record
    // lands; shuffling it is never a PATCH-sent edit.
    profileAvatarSeed: true,
  } satisfies Record<keyof CreateCommunityDraft, boolean>;
  // Adding a draft field requires an explicit comparison decision above.
  return Object.values(matches).every(Boolean);
}
