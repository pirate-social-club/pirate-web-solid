import { browserIdentitySession } from "../../api/browser-identity-session.ts";
import { refreshSession, resolveSession, sessionPersonasUnavailable, type AuthenticatedSession, type ActivePersonaPublicProjection } from "../../api/session.ts";
import { requestGlobalSignInCompletion } from "../auth/global-sign-in-host.tsx";
import { createActivityPersonaPreparationApi, type ActivityPersonaPreparationApi } from "./activity-persona-preparation.ts";
import { communityOperationPersonas, type CommunityPersonaChoice } from "./community-persona-choice.ts";

export interface CommunityProfilePreparationInput {
  readonly accountId: string;
  readonly communityId: string;
  readonly session: AuthenticatedSession;
  readonly preferredPersonaId?: string;
  readonly choice?: CommunityPersonaChoice;
  readonly preparationKey: string;
  readonly walletKey: string;
  readonly signal: AbortSignal;
}

export class CommunityProfilePreparationError extends Error {
  constructor(readonly reason: "profiles_unavailable" | "profile_selection_required" | "activation_required" | "identity_changed" | "invalid_preparation") {
    super(reason);
    this.name = "CommunityProfilePreparationError";
  }
}

/** Profile authority comes from preparation and a fresh owned active-profile read. */
export function createCommunityProfilePreparation(options: {
  readonly api?: ActivityPersonaPreparationApi;
  readonly resolve?: typeof resolveSession;
  readonly activateWallet?: typeof browserIdentitySession.activatePersonaWallet;
  readonly signIn?: typeof requestGlobalSignInCompletion;
  readonly refresh?: typeof refreshSession;
} = {}) {
  const api = options.api ?? createActivityPersonaPreparationApi();
  const resolve = options.resolve ?? resolveSession;
  return async (input: CommunityProfilePreparationInput): Promise<ActivePersonaPublicProjection> => {
    const alive = () => input.signal.throwIfAborted();
    alive();
    if (input.session.userId !== input.accountId) throw new CommunityProfilePreparationError("identity_changed");
    if (sessionPersonasUnavailable(input.session)) throw new CommunityProfilePreparationError("profiles_unavailable");
    const existing = communityOperationPersonas(input.session.personas, input.communityId);
    const preferred = existing.find(persona => persona.personaId === input.preferredPersonaId);
    if (preferred !== undefined) return preferred;
    if (existing.length === 1) return existing[0]!;
    if (existing.length > 1) throw new CommunityProfilePreparationError("profile_selection_required");
    const unbound = input.session.personas.filter(persona => persona.communityBinding === null);
    const choice = input.choice ?? (unbound.length === 1
      ? { kind: "existing" as const, personaId: unbound[0]!.personaId }
      : { kind: "create_new" as const });
    const prepared = await api.prepare({ communityId: input.communityId, idempotencyKey: input.preparationKey, choice, signal: input.signal });
    alive();
    if (prepared.community_id !== input.communityId || !prepared.persona_id
      || (choice.kind === "existing" && prepared.persona_id !== choice.personaId)) {
      throw new CommunityProfilePreparationError("invalid_preparation");
    }
    if (prepared.persona_status === "pending_wallet") {
      const activated = await (options.activateWallet ?? browserIdentitySession.activatePersonaWallet)(input.accountId, prepared.persona_id, input.walletKey, input.signal);
      alive();
      // Ordinary host-local sign-in resumes a server pending wallet after reload.
      if (!activated && !await (options.signIn ?? requestGlobalSignInCompletion)(input.signal)) throw new CommunityProfilePreparationError("activation_required");
      alive();
    }
    (options.refresh ?? refreshSession)();
    const session = await resolve();
    alive();
    if (session === "anonymous" || session.userId !== input.accountId) throw new CommunityProfilePreparationError("identity_changed");
    if (sessionPersonasUnavailable(session)) throw new CommunityProfilePreparationError("profiles_unavailable");
    const profile = communityOperationPersonas(session.personas, input.communityId).find(persona => persona.personaId === prepared.persona_id);
    if (profile === undefined) throw new CommunityProfilePreparationError("activation_required");
    return profile;
  };
}
