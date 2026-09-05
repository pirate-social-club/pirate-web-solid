import type { ActivePersonaPublicProjection } from "../../api/session";
import type { OperationPersona } from "./operation-persona-control/operation-persona-control";

/**
 * The closed persona choice every terminal community membership or
 * community-creation commit must carry (spec 014 §10.2, generated client
 * 0.56.0). A browser never invents a binding or a persona id: it either names
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

/**
 * Default choice under the community persona boundary.
 *
 * The generated client exposes no persona-to-community binding, so the
 * community's eligible set cannot be enumerated in the browser; the server is
 * the eligibility authority and answers a bound-elsewhere persona with a typed
 * conflict. The default therefore never reaches past the first persona the way
 * the old global-pool fallback did:
 *
 * - zero active personas: `create_new`, so the server mints a persona born
 *   bound to the target community in the same commit;
 * - exactly one active persona: that persona, which is the only candidate the
 *   community's eligible set could contain;
 * - more than one: no default. The account must choose explicitly so a persona
 *   already presenting in another community is never sent silently.
 */
export function defaultCommunityPersonaChoice(
  personas: readonly ActivePersonaPublicProjection[],
): CommunityPersonaChoice | undefined {
  if (personas.length === 0) return { kind: "create_new" };
  if (personas.length === 1) return { kind: "existing", personaId: personas[0]!.personaId };
  return undefined;
}

/**
 * Replacement candidates for retiring a persona: the account's other active
 * personas. The server rechecks that a designated replacement is bound to the
 * same community; a wrong-community designation is a typed conflict, never a
 * silent public-history rewrite.
 */
export function replacementCandidates(
  personas: readonly ActivePersonaPublicProjection[],
  retiringPersonaId: string,
): ActivePersonaPublicProjection[] {
  return personas.filter((persona) => persona.personaId !== retiringPersonaId);
}
