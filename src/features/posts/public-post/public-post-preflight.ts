import { createPirateApiClient, type PirateApiClientOptions } from "@pirate/api-client";
import { validateApiNextOrigin } from "../../../api/origin.ts";
import type { ApiFetch } from "../../../api/proxy.ts";
import { resolveLocaleLanguageTag, resolveRequestUiLocale } from "../../../lib/ui-locale-core.ts";
import {
  decodePublicPostSlug,
  legacyPublicPostPathFromRequest,
  loadPublicPostById,
  loadPublicPostBySlug,
  publicPostPathFromRequest,
  type PublicPostRouteState,
} from "./public-post-route.model.ts";

export type PublicPostPreflight = Readonly<{
  readonly requestPath: string;
  readonly state: PublicPostRouteState;
}>;

export type PublicPostResponsePolicy = Readonly<{
  readonly status: 200 | 400 | 404 | 405 | 502;
  readonly statusText?: string;
  readonly headers: Headers;
}>;

export function resolvePublicPostLocale(
  url: URL,
  acceptLanguage: string | null | undefined,
): string {
  return resolveLocaleLanguageTag(resolveRequestUiLocale(url, acceptLanguage));
}

function sessionCookieHeader(request: Request): string | undefined {
  const matches = (request.headers.get("cookie") ?? "")
    .split(";")
    .map(value => value.trim())
    .filter(value => value.startsWith("__Host-pirate_session="));
  return matches.length === 1 && matches[0] !== "__Host-pirate_session=" ? matches[0] : undefined;
}

function clientForRequest(request: Request, apiNextOrigin: string | undefined, fetchImpl: ApiFetch) {
  const origin = validateApiNextOrigin(apiNextOrigin);
  const cookie = sessionCookieHeader(request);
  const options: PirateApiClientOptions = {
    credentials: "omit",
    signal: request.signal,
    ...(cookie === undefined ? {} : { headers: { cookie } }),
    // SAFETY: ApiFetch has the generated client's standard fetch call shape;
    // runtime-specific static fetch members are not used by the client.
    fetchImpl: fetchImpl as typeof fetch,
  };
  return createPirateApiClient(`${origin.origin}/`, options);
}

export async function resolvePublicPostPreflight(
  request: Request,
  apiNextOrigin: string | undefined,
  fetchImpl: ApiFetch = fetch,
): Promise<PublicPostPreflight | undefined> {
  const slugRoute = publicPostPathFromRequest(request);
  const legacyRoute = legacyPublicPostPathFromRequest(request);
  if (slugRoute === undefined && legacyRoute === undefined) return undefined;
  const requestPath = new URL(request.url).pathname;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return { requestPath, state: { kind: "method-not-allowed", status: 405 } };
  }
  if (legacyRoute === null) return { requestPath, state: { kind: "invalid", status: 400 } };
  if (slugRoute !== undefined && decodePublicPostSlug(slugRoute.rawSlug) === null) {
    return { requestPath, state: { kind: "invalid", status: 400 } };
  }

  let client;
  try {
    client = clientForRequest(request, apiNextOrigin, fetchImpl);
  } catch {
    return { requestPath, state: { kind: "unavailable", status: 502 } };
  }
  const locale = resolvePublicPostLocale(new URL(request.url), request.headers.get("accept-language"));
  const state = slugRoute === undefined
    ? await loadPublicPostById({ ...legacyRoute!, client, locale, requestPath })
    : await loadPublicPostBySlug({ ...slugRoute, client, locale, requestPath });
  return { requestPath, state };
}

export function publicPostResponsePolicy(state: PublicPostRouteState): PublicPostResponsePolicy {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    Vary: "Accept-Language, Cookie",
  });
  if (state.kind === "method-not-allowed") {
    headers.set("Allow", "GET, HEAD");
    return { status: 405, statusText: "Method Not Allowed", headers };
  }
  if (state.kind === "invalid") return { status: 400, statusText: "Bad Request", headers };
  if (state.kind === "not-found") return { status: 404, statusText: "Not Found", headers };
  if (state.kind === "unavailable") return { status: 502, statusText: "Bad Gateway", headers };
  if (state.kind === "redirect") throw new Error("Redirect responses must be committed before streaming");
  return { status: 200, headers };
}
