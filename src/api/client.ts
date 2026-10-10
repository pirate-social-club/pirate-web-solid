import {
  createPirateApiClient,
  type PirateApiClient,
  type PirateApiClientOptions,
  type PirateApiRequestOptions,
} from "@pirate/api-client";
import { sameOrigin } from "./origin.ts";
import type { ApiFetch } from "./proxy.ts";
import { captureSessionAuthority, isCurrentSessionAuthority, reportSessionRejection } from "./browser-session-events.ts";
import { browserIdentitySession } from "./browser-identity-session.ts";

export type { PirateApiClient, PirateApiClientOptions, PirateApiRequestOptions } from "@pirate/api-client";

export interface ApiClientFactoryOptions {
  /** The current Solid request origin. SSR callers must pass this explicitly. */
  readonly origin?: string | URL;
  readonly fetchImpl?: ApiFetch;
}

export type GeneratedApiClientFactory<Client> = (
  baseUrl: string,
  options: PirateApiClientOptions,
) => Client;

function resolveOrigin(origin: string | URL | undefined): string {
  if (origin !== undefined) return sameOrigin(origin);
  if (typeof location !== "undefined") return location.origin;
  throw new Error("API client origin is required during SSR");
}

function headersWithCsrf(
  headers: PirateApiRequestOptions["headers"],
  csrfToken: string,
): Headers {
  const result = new Headers();
  if (headers instanceof Headers) {
    headers.forEach((value, name) => result.append(name, value));
  } else if (Array.isArray(headers)) {
    for (const [name, value] of headers) result.append(name, value);
  } else if (headers !== undefined) {
    for (const [name, value] of Object.entries(headers)) result.append(name, value);
  }
  result.set("x-csrf-token", csrfToken);
  return result;
}

/**
 * The generated client correctly models api-next but its paths are rooted at
 * /. This fetch adapter adds the one same-origin /api prefix per request.
 */
export function rewriteGeneratedClientUrl(input: RequestInfo | URL, origin: string): URL {
  const generated = new URL(input instanceof Request ? input.url : input.toString());
  const current = new URL(sameOrigin(origin));
  const rewritten = new URL(current.origin);
  const generatedPath = generated.pathname.startsWith("/") ? generated.pathname : `/${generated.pathname}`;
  rewritten.pathname = generatedPath === "/api" || generatedPath.startsWith("/api/")
    ? generatedPath
    : `/api${generatedPath}`;
  rewritten.search = generated.search;
  return rewritten;
}

export function createGeneratedApiClient<Client>(
  factory: GeneratedApiClientFactory<Client>,
  options: ApiClientFactoryOptions = {},
  requestOptions: PirateApiRequestOptions = {},
): Client {
  const origin = resolveOrigin(options.origin);
  const fetchImpl = options.fetchImpl ?? fetch;
  const rewriteFetchImplementation: ApiFetch = async (input, init) => {
    const rewritten = rewriteGeneratedClientUrl(input, origin);
    const authority = captureSessionAuthority();
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (rewritten.pathname === "/api/auth/session/logout") browserIdentitySession.clear();
    const response = await fetchImpl(rewritten, init);
    const credentials = init?.credentials ?? (input instanceof Request ? input.credentials : requestOptions.credentials);
    if (response.status === 401 && requestOptions.credentials === "same-origin"
      && credentials === "same-origin"
      && !rewritten.pathname.startsWith("/api/auth/")
      && isCurrentSessionAuthority(authority)) {
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      // Reads can be retried after a coalesced exchange. Unsafe requests and
      // wallet actions require their explicit continuation, never replay.
      if (signal?.aborted) return response;
      if (method === "GET" || method === "HEAD") {
        const renewed = await browserIdentitySession.renew();
        if (signal?.aborted || !isCurrentSessionAuthority(authority)) return response;
        if (renewed) {
          const recovered = await fetchImpl(rewritten, init);
          if (recovered.status === 401 && !signal?.aborted) reportSessionRejection(authority);
          return recovered;
        }
      }
      reportSessionRejection(authority);
    }
    return response;
  };
  // SAFETY: The generated client uses the standard fetch call signature; the
  // Worker/Bun-specific optional fetch members are not used by the adapter.
  const rewriteFetch = rewriteFetchImplementation as typeof fetch;
  return factory(`${origin}/`, {
    ...requestOptions,
    fetchImpl: rewriteFetch,
  });
}

export function createApiClient(
  options: ApiClientFactoryOptions = {},
  requestOptions: PirateApiRequestOptions = {},
): PirateApiClient {
  return createGeneratedApiClient(createPirateApiClient, options, requestOptions);
}

export function createPublicApiClient(options: ApiClientFactoryOptions = {}): PirateApiClient {
  return createApiClient(options, { credentials: "omit" });
}

export function createSessionApiClient(options: ApiClientFactoryOptions = {}): PirateApiClient {
  return createApiClient(options, { credentials: "same-origin" });
}

export function createApiClientForRequest(
  request: Request,
  requestOptions: PirateApiRequestOptions = {},
): PirateApiClient {
  return createApiClient({ origin: new URL(request.url).origin }, requestOptions);
}

/** Add same-origin credentials and a request-scoped double-submit CSRF value. */
export function sessionRequestOptions(
  csrfToken: string,
  options: PirateApiRequestOptions = {},
): PirateApiRequestOptions {
  if (csrfToken === "" || csrfToken.length > 16 * 1024 || /[\r\n]/u.test(csrfToken)) {
    throw new Error("A valid CSRF token is required");
  }
  return {
    ...options,
    credentials: "same-origin",
    headers: headersWithCsrf(options.headers, csrfToken),
  };
}

/** Read only the readable CSRF cookie; session cookies are never exposed. */
export function readCsrfCookie(cookieHeader?: string): string | undefined {
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
