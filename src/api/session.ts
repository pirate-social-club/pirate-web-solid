import { ApiClientError, type PirateApiClient } from "@pirate/api-client";
import { createSessionApiClient } from "./client.ts";
import type { ApiFetch } from "./proxy.ts";

export interface AuthenticatedSession {
  readonly status: "authenticated";
  readonly userId: string;
  readonly personas: readonly ActivePersonaPublicProjection[];
}

export type AuthenticatedAccountSession = Pick<AuthenticatedSession, "status" | "userId">;

/** Public persona fields retained by the shell after authenticated discovery. */
export interface ActivePersonaPublicProjection {
  readonly personaId: string;
  readonly displayName: string | null;
  readonly avatarRef: string | null;
  readonly primaryPublicHandle: string | null;
}

export type SessionResolution = "anonymous" | AuthenticatedSession;
export type AccountSessionResolution = "anonymous" | AuthenticatedAccountSession;
export type AccountSessionResolutionClient = Pick<PirateApiClient, "get_usersMe">;
export type SessionResolutionClient = Pick<PirateApiClient, "get_usersMe" | "get_personas">;

export interface SessionResolutionOptions {
  readonly client?: SessionResolutionClient;
  readonly origin?: string | URL;
  readonly fetchImpl?: ApiFetch;
  readonly timeoutMs?: number;
}

export interface AccountSessionResolutionOptions extends Omit<SessionResolutionOptions, "client"> {
  readonly client?: AccountSessionResolutionClient;
}

function boundedFetch(fetchImpl: ApiFetch, timeoutMs: number): ApiFetch {
  return async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

function projectPersonas(
  response: Awaited<ReturnType<PirateApiClient["get_personas"]>>,
): ActivePersonaPublicProjection[] {
  return response.personas
    .filter(persona => persona.status === "active")
    .map(persona => ({
      personaId: persona.persona_id,
      displayName: persona.profile.display_name,
      avatarRef: persona.profile.avatar_ref,
      primaryPublicHandle: persona.profile.primary_public_handle,
    }));
}

function isAnonymousRejection(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

/**
 * Resolves the host-only session without delaying the public-first home route.
 * Only an explicit 401 means anonymous; transport and server failures remain
 * errors so callers can choose their safe public fallback deliberately.
 *
 * The account and persona reads are independent, so both start immediately and
 * a slow backend cannot serialize them. The persona result is discarded when
 * the account resolves anonymous; its rejection is observed by the `.catch`
 * guard so an anonymous visitor never produces an unhandled rejection.
 */
async function resolveSessionUncached(options: SessionResolutionOptions): Promise<SessionResolution> {
  const client = options.client ?? createSessionApiClient({
    origin: options.origin,
    fetchImpl: boundedFetch(options.fetchImpl ?? fetch, options.timeoutMs ?? 4_000),
  });
  const personasPromise = client.get_personas(undefined);
  personasPromise.catch(() => undefined);
  let user: Awaited<ReturnType<PirateApiClient["get_usersMe"]>>;
  try {
    user = await client.get_usersMe(undefined);
  } catch (error) {
    if (isAnonymousRejection(error)) return "anonymous";
    throw error;
  }
  const response = await personasPromise;
  return { status: "authenticated", userId: user.id, personas: projectPersonas(response) };
}

/** Resolve only account authentication for surfaces that do not need personas. */
async function resolveAccountSessionUncached(
  options: AccountSessionResolutionOptions,
): Promise<AccountSessionResolution> {
  const client = options.client ?? createSessionApiClient({
    origin: options.origin,
    fetchImpl: boundedFetch(options.fetchImpl ?? fetch, options.timeoutMs ?? 4_000),
  });
  try {
    const user = await client.get_usersMe(undefined);
    return { status: "authenticated", userId: user.id };
  } catch (error) {
    if (isAnonymousRejection(error)) return "anonymous";
    throw error;
  }
}

function hasExplicitTransport(
  options: SessionResolutionOptions | AccountSessionResolutionOptions,
): boolean {
  return options.client !== undefined
    || options.origin !== undefined
    || options.fetchImpl !== undefined
    || options.timeoutMs !== undefined;
}

/** Creates the default browser client for the shared store. */
export type SessionClientFactory = () => SessionResolutionClient;

export interface SessionStore {
  resolveSession(options?: SessionResolutionOptions): Promise<SessionResolution>;
  resolveAccountSession(options?: AccountSessionResolutionOptions): Promise<AccountSessionResolution>;
  /** Drop the cached resolutions and notify subscribers. */
  refreshSession(): void;
  /** Subscribe to `refreshSession` calls; returns the unsubscribe function. */
  onSessionRefreshed(listener: () => void): () => void;
}

/**
 * One in-flight promise per resolution kind per store. The shell, the home
 * route, and route controllers all resolve through the page store, so a page
 * issues at most one `users/me` and one `personas` request however many
 * surfaces mount. A rejected attempt clears its slot so the next caller or an
 * explicit retry starts a fresh request; a successful resolution is kept until
 * `refreshSession` runs. Calls carrying explicit transport resolve uncached so
 * injected tests and server rendering stay deterministic.
 */
/** One coalesced in-flight promise per resolution kind. */
interface ResolutionSlot<T> {
  promise: Promise<T> | undefined;
}

interface StoreSlots {
  account: ResolutionSlot<AccountSessionResolution>;
  session: ResolutionSlot<SessionResolution>;
}

export function createSessionStore(clientFactory: SessionClientFactory): SessionStore {
  const slots: StoreSlots = {
    account: { promise: undefined },
    session: { promise: undefined },
  };
  const refreshListeners = new Set<() => void>();

  function track<T>(slot: { promise: Promise<T> | undefined }, start: () => Promise<T>): Promise<T> {
    const existing = slot.promise;
    if (existing !== undefined) return existing;
    const created = start();
    slot.promise = created;
    created.catch(() => {
      if (slot.promise === created) slot.promise = undefined;
    });
    return created;
  }

  /**
   * The shared session resolution: the account comes from the same slot the
   * shell uses, and personas start concurrently rather than after the account
   * settles. Declared before `store` and referencing it by name so both
   * resolutions share this store's slots and factory.
   */
  function resolveSessionShared(): Promise<SessionResolution> {
    const client = clientFactory();
    const personasPromise = client.get_personas(undefined);
    personasPromise.catch(() => undefined);
    return store.resolveAccountSession().then(account => {
      if (account === "anonymous") return "anonymous" as const;
      return personasPromise.then(response => ({
        status: "authenticated" as const,
        userId: account.userId,
        personas: projectPersonas(response),
      }));
    });
  }

  const store: SessionStore = {
    resolveSession(options: SessionResolutionOptions = {}) {
      if (hasExplicitTransport(options) || typeof window === "undefined") {
        return resolveSessionUncached(options);
      }
      return track(slots.session, resolveSessionShared);
    },
    resolveAccountSession(options: AccountSessionResolutionOptions = {}) {
      if (hasExplicitTransport(options) || typeof window === "undefined") {
        return resolveAccountSessionUncached(options);
      }
      return track(slots.account, () => {
        const client = clientFactory();
        return resolveAccountSessionUncached({ client });
      });
    },
    refreshSession() {
      slots.account.promise = undefined;
      slots.session.promise = undefined;
      for (const listener of [...refreshListeners]) listener();
    },
    onSessionRefreshed(listener: () => void) {
      refreshListeners.add(listener);
      return () => {
        refreshListeners.delete(listener);
      };
    },
  };
  return store;
}

/**
 * The page-level store. Server rendering never reaches it through the default
 * exports: module state is shared across Worker requests, so every
 * server-side call resolves uncached through the `typeof window` guard above.
 */
const browserStore = createSessionStore(() => createSessionApiClient({
  fetchImpl: boundedFetch(fetch, 4_000),
}));

/** Resolve the session for persona-aware surfaces; see `createSessionStore`. */
export function resolveSession(options: SessionResolutionOptions = {}): Promise<SessionResolution> {
  return browserStore.resolveSession(options);
}

/** Resolve account authentication for chrome and account-only surfaces. */
export function resolveAccountSession(
  options: AccountSessionResolutionOptions = {},
): Promise<AccountSessionResolution> {
  return browserStore.resolveAccountSession(options);
}

/**
 * Drop the shared store's cached resolutions and notify subscribers. Called
 * after a successful sign-in exchange so the shell and any mounted route
 * re-resolve without a document reload.
 */
export function refreshSession(): void {
  browserStore.refreshSession();
}

/** Subscribe to shared `refreshSession` calls; returns the unsubscribe function. */
export function onSessionRefreshed(listener: () => void): () => void {
  return browserStore.onSessionRefreshed(listener);
}
