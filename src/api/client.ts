import {
  createPirateApiClient,
  type PirateApiClient,
  type PirateApiClientOptions,
  type PirateApiRequestOptions,
} from "@pirate/api-client";
import { sameOrigin } from "./origin.ts";
import type { ApiFetch } from "./proxy.ts";
import { captureSessionAuthority, establishedSessionAccount, reportSessionRejection } from "./browser-session-events.ts";
import { browserSessionRenewal } from "./browser-session-renewal.ts";
import { fenceBrowserSessionResponse } from "./browser-session-response.ts";
import { captureBrowserSessionFence, changeBrowserAuthentication, isCurrentBrowserSessionFence, reportBrowserAccountChange, SessionAuthorityChangedError, SessionRenewalUnavailableError, withBrowserAuthLock } from "./browser-auth-coordination.ts";

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
    const credentials = init?.credentials ?? (input instanceof Request ? input.credentials : requestOptions.credentials);
    const privateBrowser = typeof window !== "undefined" && requestOptions.credentials === "same-origin" && credentials === "same-origin";
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const outbound = input instanceof Request ? new Request(rewritten, input) : rewritten;
    // SAFETY: Request cloning uses only Fetch-standard fields; Worker-specific
    // generic metadata is irrelevant to this same-origin browser transport.
    const send = () => fetchImpl(outbound instanceof Request ? outbound.clone() as RequestInfo : outbound, init);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const authMutation = method === "POST" && ["/api/auth/session/exchange", "/api/auth/register", "/api/auth/session/logout"].includes(rewritten.pathname);
    if (privateBrowser && authMutation) {
      return changeBrowserAuthentication(rewritten.pathname.endsWith("/logout") ? "logout" : "changed", send, signal ?? undefined);
    }
    if (!privateBrowser) return send();
    const authority = captureSessionAuthority();
    const fence = captureBrowserSessionFence();
    const account = establishedSessionAccount();
    const current = () => isCurrentBrowserSessionFence(fence);
    if (rewritten.pathname === "/api/auth/session/renew") {
      return withBrowserAuthLock(async () => {
        if (!current()) throw new SessionAuthorityChangedError();
        const renewed = await send();
        if (!current()) throw new SessionAuthorityChangedError();
        return renewed;
      }, signal ?? undefined, true);
    }
    const response = await send();
    if (rewritten.pathname.startsWith("/api/auth/")) return response;
    if (signal?.aborted) return response;
    if (!current()) throw new SessionAuthorityChangedError();
    if (response.status !== 401) return fenceBrowserSessionResponse(response, current);
    // Only a safe read can be replayed, once. Writes retain their original
    // command/journal and require an explicit continuation after reauthentication.
    if ((method !== "GET" && method !== "HEAD") || readCsrfCookie() === undefined) {
      reportSessionRejection(authority);
      return response;
    }
    const result = await browserSessionRenewal.renew({
      key: fence.revision ?? 0, current, expectedAccount: account, accountChanged: reportBrowserAccountChange,
      lock: (action, renewalSignal) => withBrowserAuthLock(action, renewalSignal, true),
      request: async renewalSignal => {
        const csrf = readCsrfCookie();
        if (csrf === undefined) throw new SessionRenewalUnavailableError();
        // Use the genuine generated contract with a plain rewriting transport.
        // Renewal cannot recursively renew itself or touch a provider session.
        const renewalFetch: ApiFetch = (value, requestInit) => fetchImpl(rewriteGeneratedClientUrl(value, origin), requestInit);
        // SAFETY: the generated client calls only the standard Fetch signature.
        const client = createPirateApiClient(`${origin}/`, { credentials: "same-origin", fetchImpl: renewalFetch as typeof fetch });
        return client.post_authSessionRenew(undefined, sessionRequestOptions(csrf, { signal: renewalSignal }));
      },
    });
    if (signal?.aborted) return response;
    if (!current()) throw new SessionAuthorityChangedError();
    if (result === "rejected") { reportSessionRejection(authority); return response; }
    const recovered = await send();
    if (signal?.aborted) return recovered;
    if (!current()) throw new SessionAuthorityChangedError();
    if (recovered.status === 401) reportSessionRejection(authority);
    return fenceBrowserSessionResponse(recovered, current);
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
  let found: string | undefined;
  for (const pair of source.split(";")) {
    const separator = pair.indexOf("=");
    if (separator <= 0 || pair.slice(0, separator).trim() !== "__Host-pirate_csrf") continue;
    const value = pair.slice(separator + 1).trim();
    if (value === "" || value.length > 16 * 1024 || /[\r\n]/u.test(value)) return undefined;
    if (found !== undefined) return undefined;
    found = value;
  }
  return found;
}
