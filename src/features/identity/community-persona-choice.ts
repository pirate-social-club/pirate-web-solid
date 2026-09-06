import type { ActivePersonaPublicProjection } from "../../api/session";
import type { OperationPersona } from "./operation-persona-control/operation-persona-control";

export const PERSONA_CREATION_UNAVAILABLE =
  "New community personas are coming soon. Choose an existing eligible persona; without one, you cannot join or create a community yet.";

/**
 * The closed persona choice every terminal community membership or
 * community-creation commit must carry (spec 014 §10.2, generated client
 * contract). A browser never invents a binding or a persona id: it either names
 * one of the account's active personas or asks the server to mint one bound to
 * the target community in the same commit.
 */
export type CommunityPersonaChoice =
  | { readonly kind: "existing"; readonly personaId: string }
  | { readonly kind: "create_new" };

/** Wire form of {@link CommunityPersonaChoice}; the union is closed. */
export type CommunityPersonaChoiceWire =
  | { readonly kind: "existing"; readonly persona_id: string }
  | { readonly kind: "create_new" };

export function toCommunityPersonaChoiceWire(
  choice: CommunityPersonaChoice,
): CommunityPersonaChoiceWire {
  return choice.kind === "existing"
    ? { kind: "existing", persona_id: choice.personaId }
    : { kind: "create_new" };
}

/** Map the session's active-persona projection to selector options. */
export function toOperationPersonas(
  personas: readonly ActivePersonaPublicProjection[],
): OperationPersona[] {
  return personas.map((persona) => ({
    avatarSrc: persona.avatarRef,
    displayName: persona.displayName ?? persona.primaryPublicHandle ?? persona.personaId,
    personaId: persona.personaId,
    publicHandle: persona.primaryPublicHandle,
  }));
}

/** Posting, Study and Karaoke cannot mint or bind an unbound persona. */
export function communityOperationPersonas(
  personas: readonly ActivePersonaPublicProjection[], communityId: string,
): ActivePersonaPublicProjection[] {
  return personas.filter(persona => persona.communityBinding?.communityId === communityId);
}

/** Terminal joins may reuse a binding here or establish an unbound persona's binding. */
export function communityJoinCandidates(
  personas: readonly ActivePersonaPublicProjection[], communityId: string,
): ActivePersonaPublicProjection[] {
  return personas.filter(persona => persona.communityBinding === null
    || persona.communityBinding?.communityId === communityId);
}

/** A newly created community can only bind a previously unbound persona. */
export function communityCreationCandidates(
  personas: readonly ActivePersonaPublicProjection[],
): ActivePersonaPublicProjection[] {
  return personas.filter(persona => persona.communityBinding === null);
}

/** Pass operation-eligible candidates, never the global account pool. */
export function defaultOperationPersonaId(
  personas: readonly ActivePersonaPublicProjection[],
): string | undefined {
  return personas.length === 1 ? personas[0]!.personaId : undefined;
}

/** Pass scoped join or creation candidates. Both operations permit create-new. */
export function defaultCommunityPersonaChoice(
  personas: readonly ActivePersonaPublicProjection[],
): CommunityPersonaChoice | undefined {
  if (personas.length === 0) return { kind: "create_new" };
  if (personas.length === 1) return { kind: "existing", personaId: personas[0]!.personaId };
  return undefined;
}
