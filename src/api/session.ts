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

/**
 * Resolves the host-only session without delaying the public-first home route.
 * Only an explicit 401 means anonymous; transport and server failures remain
 * errors so callers can choose their safe public fallback deliberately.
 */
export async function resolveSession(options: SessionResolutionOptions = {}): Promise<SessionResolution> {
  const client = options.client ?? createSessionApiClient({
    origin: options.origin,
    fetchImpl: boundedFetch(options.fetchImpl ?? fetch, options.timeoutMs ?? 4_000),
  });
  try {
    const user = await client.get_usersMe(undefined);
    const response = await client.get_personas(undefined);
    const personas = response.personas
      .filter(persona => persona.status === "active")
      .map(persona => ({
        personaId: persona.persona_id,
        displayName: persona.profile.display_name,
        avatarRef: persona.profile.avatar_ref,
        primaryPublicHandle: persona.profile.primary_public_handle,
      }));
    return { status: "authenticated", userId: user.id, personas };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return "anonymous";
    throw error;
  }
}

/** Resolve only account authentication for surfaces that do not need personas. */
export async function resolveAccountSession(
  options: AccountSessionResolutionOptions = {},
): Promise<AccountSessionResolution> {
  const client = options.client ?? createSessionApiClient({
    origin: options.origin,
    fetchImpl: boundedFetch(options.fetchImpl ?? fetch, options.timeoutMs ?? 4_000),
  });
  try {
    const user = await client.get_usersMe(undefined);
    return { status: "authenticated", userId: user.id };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return "anonymous";
    throw error;
  }
}
