import { ApiClientError, type PirateApiClient } from "@pirate/api-client";
import { createSessionApiClient } from "./client.ts";
import type { ApiFetch } from "./proxy.ts";

export interface AuthenticatedSession {
  readonly status: "authenticated";
  readonly userId: string;
}

export type SessionResolution = "anonymous" | AuthenticatedSession;
export type SessionResolutionClient = Pick<PirateApiClient, "get_usersMe">;

export interface SessionResolutionOptions {
  readonly client?: SessionResolutionClient;
  readonly origin?: string | URL;
  readonly fetchImpl?: ApiFetch;
  readonly timeoutMs?: number;
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
    return { status: "authenticated", userId: user.id };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return "anonymous";
    throw error;
  }
}
