import { createPirateApiClient, type PirateApiClientOptions } from "@pirate/api-client";
import { validateApiNextOrigin } from "../../../api/origin.ts";
import type { ApiFetch } from "../../../api/proxy.ts";
import {
  loadPublicProfile,
  normalizePirateHandle,
  type PublicProfileViewState,
} from "./public-profile-page.model.ts";

export const PUBLIC_PROFILE_HTML_CACHE_CONTROL = "no-store";

export type PublicProfilePreflight = Readonly<{
  readonly requestedHandle: string;
  readonly state: PublicProfileViewState;
}>;

export type PublicProfileResponsePolicy = Readonly<{
  readonly status: 200 | 302 | 400 | 404 | 502;
  readonly statusText?: string;
  readonly headers: Headers;
}>;

/** Return the one decoded route parameter for an exact `/u/:handle` path. */
export function publicProfileHandleFromRequest(request: Request): string | undefined {
  const match = /^\/u\/([^/]+)$/u.exec(new URL(request.url).pathname);
  if (match?.[1] === undefined) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/**
 * Resolve anonymous profile state directly against api-next before Solid opens
 * the response stream. No incoming headers or credentials cross this seam.
 */
export async function resolvePublicProfilePreflight(
  request: Request,
  apiNextOrigin: string | undefined,
  fetchImpl: ApiFetch = fetch,
): Promise<PublicProfilePreflight | undefined> {
  const requestedHandle = publicProfileHandleFromRequest(request);
  if (requestedHandle === undefined) return undefined;

  if (normalizePirateHandle(requestedHandle) === null) {
    return { requestedHandle, state: { kind: "invalid", status: 400 } };
  }

  let origin: URL;
  try {
    origin = validateApiNextOrigin(apiNextOrigin);
  } catch {
    return { requestedHandle, state: { kind: "unavailable", status: 502 } };
  }

  const options: PirateApiClientOptions = {
    credentials: "omit",
    signal: request.signal,
    // SAFETY: ApiFetch is the standard call signature used by the generated
    // client; Bun's nonstandard static `fetch.preconnect` member is irrelevant.
    fetchImpl: fetchImpl as typeof fetch,
  };
  const client = createPirateApiClient(`${origin.origin}/`, options);
  return {
    requestedHandle,
    state: await loadPublicProfile(client, requestedHandle),
  };
}

/** The complete response policy is known before any profile HTML is written. */
export function publicProfileResponsePolicy(
  request: Request,
  state: PublicProfileViewState,
): PublicProfileResponsePolicy {
  const headers = new Headers({
    "Cache-Control": PUBLIC_PROFILE_HTML_CACHE_CONTROL,
    Vary: "Accept-Language",
  });

  if (state.kind === "success") {
    if (state.isCanonical) return { status: 200, headers };
    headers.set("Location", new URL(state.canonicalPath, new URL(request.url).origin).toString());
    return { status: 302, statusText: "Found", headers };
  }

  if (state.kind === "invalid") return { status: 400, statusText: "Bad Request", headers };
  if (state.kind === "not-found") return { status: 404, statusText: "Not Found", headers };
  return { status: 502, statusText: "Bad Gateway", headers };
}
