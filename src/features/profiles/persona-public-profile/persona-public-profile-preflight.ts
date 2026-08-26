import { createPirateApiClient, type PirateApiClientOptions } from "@pirate/api-client-handle-sales";
import { validateApiNextOrigin } from "../../../api/origin.ts";
import type { ApiFetch } from "../../../api/proxy.ts";
import {
  isPublicPersonaId,
  loadPersonaPublicProfile,
  type PersonaPublicProfileState,
} from "./persona-public-profile.model.ts";

export type PersonaPublicProfilePreflight = Readonly<{
  readonly personaId: string;
  readonly state: PersonaPublicProfileState;
}>;

export type PersonaPublicProfileResponsePolicy = Readonly<{
  readonly status: 200 | 400 | 404 | 405 | 502;
  readonly statusText?: string;
  readonly headers: Headers;
}>;

export function decodePersonaRouteParam(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function personaIdFromRequest(request: Request): string | undefined {
  const match = /^\/p\/([^/]+)$/u.exec(new URL(request.url).pathname);
  if (match?.[1] === undefined) return undefined;
  const decoded = decodePersonaRouteParam(match[1]);
  return decoded !== null && match[1] === encodeURIComponent(decoded) ? decoded : "";
}

export async function resolvePersonaPublicProfilePreflight(
  request: Request,
  apiNextOrigin: string | undefined,
  fetchImpl: ApiFetch = fetch,
): Promise<PersonaPublicProfilePreflight | undefined> {
  const personaId = personaIdFromRequest(request);
  if (personaId === undefined) return undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return { personaId, state: { kind: "method-not-allowed", status: 405 } };
  }
  if (!isPublicPersonaId(personaId)) {
    return { personaId, state: { kind: "invalid", status: 400 } };
  }
  let origin: URL;
  try {
    origin = validateApiNextOrigin(apiNextOrigin);
  } catch {
    return { personaId, state: { kind: "unavailable", status: 502 } };
  }
  const options: PirateApiClientOptions = {
    credentials: "omit",
    signal: request.signal,
    // SAFETY: ApiFetch is the standard call signature consumed by the
    // generated client; runtime-specific static fetch members are irrelevant.
    fetchImpl: fetchImpl as typeof fetch,
  };
  const client = createPirateApiClient(`${origin.origin}/`, options);
  return { personaId, state: await loadPersonaPublicProfile(client, personaId) };
}

export function personaPublicProfileResponsePolicy(
  state: PersonaPublicProfileState,
): PersonaPublicProfileResponsePolicy {
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Accept-Language" });
  if (state.kind === "success") return { status: 200, headers };
  if (state.kind === "invalid") return { status: 400, statusText: "Bad Request", headers };
  if (state.kind === "not-found") return { status: 404, statusText: "Not Found", headers };
  if (state.kind === "method-not-allowed") {
    headers.set("Allow", "GET, HEAD");
    return { status: 405, statusText: "Method Not Allowed", headers };
  }
  return { status: 502, statusText: "Bad Gateway", headers };
}
