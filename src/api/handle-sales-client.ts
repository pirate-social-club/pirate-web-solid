import {
  createPirateApiClient,
  type PirateApiClient,
  type PirateApiRequestOptions,
} from "@pirate/api-client-happy-path";

import { sameOrigin } from "./origin.ts";
import type { ApiFetch } from "./proxy.ts";

export type PublicHandleSalesApiClient = Pick<
  PirateApiClient,
  "get_communitiesCommunityIdHandleOfferings"
>;

export type PublicPersonaApiClient = Pick<PirateApiClient, "get_publicPersonasPersonaId">;

export type SessionHandleSalesApiClient = Pick<
  PirateApiClient,
  | "get_handleClaimsClaimId"
  | "get_personas"
  | "post_handleClaims"
  | "post_handlePersonaLinkConfirmations"
  | "post_handleQuotes"
  | "post_handleReservations"
>;

export interface HandleSalesClientFactoryOptions {
  readonly origin?: string | URL;
  readonly fetchImpl?: ApiFetch;
}

function resolveOrigin(origin: string | URL | undefined): string {
  if (origin !== undefined) return sameOrigin(origin);
  if (typeof location !== "undefined") return location.origin;
  throw new Error("Handle-sales API origin is required during SSR");
}

function withApiPrefix(input: RequestInfo | URL, origin: string): URL {
  const generated = new URL(input instanceof Request ? input.url : input.toString());
  const current = new URL(sameOrigin(origin));
  const rewritten = new URL(current.origin);
  const generatedPath = generated.pathname.startsWith("/")
    ? generated.pathname
    : `/${generated.pathname}`;
  rewritten.pathname = generatedPath === "/api" || generatedPath.startsWith("/api/")
    ? generatedPath
    : `/api${generatedPath}`;
  rewritten.search = generated.search;
  return rewritten;
}

function createHandleSalesClient(
  options: HandleSalesClientFactoryOptions,
  requestOptions: PirateApiRequestOptions,
): PirateApiClient {
  const origin = resolveOrigin(options.origin);
  const fetchImpl = options.fetchImpl ?? fetch;
  const rewriteFetchImplementation: ApiFetch = async (input, init) =>
    fetchImpl(withApiPrefix(input, origin), init);
  // SAFETY: the generated client calls only the standard Fetch signature.
  const rewriteFetch = rewriteFetchImplementation as typeof fetch;
  return createPirateApiClient(`${origin}/`, {
    ...requestOptions,
    fetchImpl: rewriteFetch,
  });
}

export function createPublicHandleSalesClient(
  options: HandleSalesClientFactoryOptions = {},
): PublicHandleSalesApiClient & PublicPersonaApiClient {
  return createHandleSalesClient(options, { credentials: "omit" });
}

export function createSessionHandleSalesClient(
  options: HandleSalesClientFactoryOptions = {},
): SessionHandleSalesApiClient {
  return createHandleSalesClient(options, { credentials: "same-origin" });
}

function copyHeaders(headers: PirateApiRequestOptions["headers"]): Headers {
  const result = new Headers();
  if (headers instanceof Headers) {
    headers.forEach((value, name) => result.append(name, value));
  } else if (Array.isArray(headers)) {
    for (const [name, value] of headers) result.append(name, value);
  } else if (headers !== undefined) {
    for (const [name, value] of Object.entries(headers)) result.append(name, value);
  }
  return result;
}

/** Read only the readable double-submit cookie; the session cookie stays HttpOnly. */
export function readHandleSalesCsrfCookie(cookieHeader?: string): string | undefined {
  const source = cookieHeader ?? (typeof document === "undefined" ? "" : document.cookie);
  for (const pair of source.split(";")) {
    const separator = pair.indexOf("=");
    if (separator <= 0 || pair.slice(0, separator).trim() !== "__Host-pirate_csrf") continue;
    const value = pair.slice(separator + 1).trim();
    if (value === "" || value.length > 16 * 1024 || /[\r\n]/u.test(value)) return undefined;
    return value;
  }
  return undefined;
}

export function handleSalesMutationOptions(
  csrfToken: string,
  options: PirateApiRequestOptions = {},
): PirateApiRequestOptions {
  if (csrfToken === "" || csrfToken.length > 16 * 1024 || /[\r\n]/u.test(csrfToken)) {
    throw new Error("A valid CSRF token is required");
  }
  const headers = copyHeaders(options.headers);
  headers.set("x-csrf-token", csrfToken);
  return { ...options, credentials: "same-origin", headers };
}
