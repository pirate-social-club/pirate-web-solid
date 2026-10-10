import type { AuthenticatedSession } from "../../api/session.ts";
import { createCommunityProfilePreparation } from "./community-profile-preparation.ts";
import { communityOperationPersonas, type CommunityPersonaChoice } from "./community-persona-choice.ts";

interface ProfileAttempt {
  readonly preparationKey: string;
  readonly walletKey: string;
  readonly choice?: CommunityPersonaChoice;
}

/** Only command keys and an identity choice are retained; no credentials. */
export function createCommunityProfileAttempt(prepare = createCommunityProfilePreparation()) {
  return async (input: { session: AuthenticatedSession; communityId: string; preferredPersonaId?: string; choice?: CommunityPersonaChoice; signal: AbortSignal }) => {
    input.signal.throwIfAborted();
    if (input.session.personasUnavailable) throw new Error("profiles_unavailable");
    if (communityOperationPersonas(input.session.personas, input.communityId).length > 0) {
      return prepare({ ...input, accountId: input.session.userId, preparationKey: crypto.randomUUID(), walletKey: crypto.randomUUID() });
    }
    const storageKey = `pirate:community-profile:v1:${encodeURIComponent(input.session.userId)}:${encodeURIComponent(input.communityId)}`;
    let attempt: ProfileAttempt;
    const saved = sessionStorage.getItem(storageKey);
    if (saved !== null) {
      const value: unknown = JSON.parse(saved);
      if (typeof value !== "object" || value === null || !("preparationKey" in value) || typeof value.preparationKey !== "string"
        || !("walletKey" in value) || typeof value.walletKey !== "string") throw new Error("invalid_profile_attempt");
      // SAFETY: retained data is correlation intent only; preparation validates server authority.
      attempt = value as ProfileAttempt;
      if (attempt.choice !== undefined && (attempt.choice.kind !== "create_new" && (attempt.choice.kind !== "existing" || typeof attempt.choice.personaId !== "string"))) throw new Error("invalid_profile_attempt");
    } else {
      const unbound = input.session.personas.filter(profile => profile.communityBinding === null);
      const choice = input.choice ?? (unbound.length === 1 ? { kind: "existing" as const, personaId: unbound[0]!.personaId } : { kind: "create_new" as const });
      attempt = { preparationKey: crypto.randomUUID(), walletKey: crypto.randomUUID(), choice };
      // Fail before any command if durable recovery is unavailable.
      sessionStorage.setItem(storageKey, JSON.stringify(attempt));
    }
    const profile = await prepare({ ...input, accountId: input.session.userId, preparationKey: attempt.preparationKey, walletKey: attempt.walletKey,
      ...(attempt.choice === undefined ? {} : { choice: attempt.choice }) });
    input.signal.throwIfAborted();
    try { sessionStorage.removeItem(storageKey); } catch { /* Fresh owned active authority already proves preparation completed. */ }
    return profile;
  };
}
