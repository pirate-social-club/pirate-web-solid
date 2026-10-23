import { resolveSession, type AuthenticatedSession } from "../../api/session.ts";
import { CommunityProfilePreparationError, createCommunityProfilePreparation } from "./community-profile-preparation.ts";
import { communityOperationPersonas, type CommunityPersonaChoice } from "./community-persona-choice.ts";

interface ProfileAttempt {
  readonly preparationKey: string;
  readonly walletKey: string;
  readonly choice?: CommunityPersonaChoice;
}

export interface CommunityProfileLock {
  request<T>(name: string, signal: AbortSignal, callback: () => Promise<T>): Promise<T>;
}

/** Only command keys and an identity choice are retained; no credentials. */
export function createCommunityProfileAttempt(prepare = createCommunityProfilePreparation(), options: {
  readonly resolve?: typeof resolveSession;
  readonly locks?: CommunityProfileLock;
} = {}) {
  return async (input: { session: AuthenticatedSession; communityId: string; preferredPersonaId?: string; choice?: CommunityPersonaChoice; signal: AbortSignal }) => {
    input.signal.throwIfAborted();
    if (input.session.personasUnavailable) throw new Error("profiles_unavailable");
    const storageKey = `pirate:community-profile:v1:${encodeURIComponent(input.session.userId)}:${encodeURIComponent(input.communityId)}`;
    const canReuse = (session: AuthenticatedSession) => {
      const profiles = communityOperationPersonas(session.personas, input.communityId);
      return input.choice === undefined ? profiles.length > 0
        : input.choice.kind === "existing" && profiles.some(profile => input.choice?.kind === "existing" && profile.personaId === input.choice.personaId);
    };
    const selectedChoice = input.choice ?? (input.preferredPersonaId === undefined ? undefined
      : { kind: "existing" as const, personaId: input.preferredPersonaId });
    const readAttempt = () => localStorage.getItem(storageKey) ?? sessionStorage.getItem(storageKey);
    let initialSaved: string | null;
    try { initialSaved = readAttempt(); }
    catch (error) {
      // An already active selected profile needs no new command or journal.
      if (!canReuse(input.session)) throw error;
      initialSaved = null;
    }
    if (initialSaved === null && canReuse(input.session)) {
      return prepare({ ...input, accountId: input.session.userId, preparationKey: crypto.randomUUID(), walletKey: crypto.randomUUID() });
    }
    const locks = options.locks ?? (typeof navigator !== "undefined" && navigator.locks !== undefined ? {
      request: async <T>(name: string, signal: AbortSignal, callback: () => Promise<T>): Promise<T> =>
        await navigator.locks.request(name, { signal }, callback),
    } : undefined);
    if (locks === undefined) throw new Error("profile_coordination_unavailable");
    return locks.request(storageKey, input.signal, async () => {
      input.signal.throwIfAborted();
      // Another tab may have finished while this caller waited. Reconcile
      // owned active authority without the identity-change broadcast that
      // disposes this route and aborts its preparation.
      const session = await (options.resolve ?? resolveSession)({ fetchImpl: fetch });
      input.signal.throwIfAborted();
      if (session === "anonymous" || session.userId !== input.session.userId) throw new CommunityProfilePreparationError("identity_changed");
      if (session.personasUnavailable) throw new CommunityProfilePreparationError("profiles_unavailable");
      const saved = readAttempt();
      if (saved === null && canReuse(session)) {
        return prepare({ ...input, session, accountId: session.userId, preparationKey: crypto.randomUUID(), walletKey: crypto.randomUUID() });
      }
      let attempt: ProfileAttempt;
      if (saved !== null) {
        const value: unknown = JSON.parse(saved);
        if (typeof value !== "object" || value === null || !("preparationKey" in value) || typeof value.preparationKey !== "string"
          || !("walletKey" in value) || typeof value.walletKey !== "string") throw new Error("invalid_profile_attempt");
        // SAFETY: retained data is correlation intent only; preparation validates server authority.
        attempt = value as ProfileAttempt;
        if (attempt.choice !== undefined && (attempt.choice.kind !== "create_new" && (attempt.choice.kind !== "existing" || typeof attempt.choice.personaId !== "string"))) throw new Error("invalid_profile_attempt");
        if (selectedChoice !== undefined && attempt.choice !== undefined
          && (selectedChoice.kind !== attempt.choice.kind || (selectedChoice.kind === "existing" && attempt.choice.kind === "existing" && selectedChoice.personaId !== attempt.choice.personaId))) {
          throw new Error("profile_attempt_conflict");
        }
        localStorage.setItem(storageKey, JSON.stringify(attempt));
        sessionStorage.removeItem(storageKey);
      } else {
        const unbound = session.personas.filter(profile => profile.communityBinding === null);
        if (input.choice === undefined && unbound.length > 1) throw new CommunityProfilePreparationError("profile_selection_required");
        const choice = input.choice ?? (unbound.length === 1 ? { kind: "existing" as const, personaId: unbound[0]!.personaId } : { kind: "create_new" as const });
        attempt = { preparationKey: crypto.randomUUID(), walletKey: crypto.randomUUID(), choice };
        // Fail before any command if durable recovery is unavailable.
        localStorage.setItem(storageKey, JSON.stringify(attempt));
      }
      const profile = await prepare({ ...input, session, accountId: input.session.userId, preparationKey: attempt.preparationKey, walletKey: attempt.walletKey,
        ...(attempt.choice === undefined ? {} : { choice: attempt.choice }) });
      input.signal.throwIfAborted();
      try { localStorage.removeItem(storageKey); sessionStorage.removeItem(storageKey); } catch { /* Fresh owned active authority already proves preparation completed. */ }
      return profile;
    });
  };
}
