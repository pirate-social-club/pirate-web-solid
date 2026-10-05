import {
  createPirateApiClient,
  type PirateApiClient,
  type PirateApiClientOptions,
} from "@pirate/api-client";
import { normalizeCommunityPathSegment } from "./community-path-segment.ts";
import { sameOrigin } from "./origin.ts";
import type { ApiFetch } from "./proxy.ts";

export type CommunityRouteApiClient = Pick<
  PirateApiClient,
  "get_cPathSegment" | "get_communitiesCommunityIdPreview"
>;

export interface CommunityRouteClientFactoryOptions {
  readonly origin?: string | URL;
  readonly fetchImpl?: ApiFetch;
}

function resolveOrigin(origin: string | URL | undefined): string {
  if (origin !== undefined) return sameOrigin(origin);
  if (typeof location !== "undefined") return location.origin;
  throw new Error("Community route API origin is required during SSR");
}

/** Preserve the exact-raw /c route contract while retaining SDK validation. */
export function createCanonicalCommunityRouteClient(
  baseUrl: string,
  options: Omit<PirateApiClientOptions, "fetchImpl"> & { readonly fetchImpl?: ApiFetch } = {},
): PirateApiClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const canonicalFetch: ApiFetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const match = /^\/c\/([^/]+)$/u.exec(url.pathname);
    if (match?.[1] !== undefined) {
      // Decode only the SDK's one encoded route parameter. Invalid or already
      // encoded caller input stays encoded and is refused by api-next.
      const segment = normalizeCommunityPathSegment(decodeURIComponent(match[1]));
      if (segment !== null) url.pathname = `/c/${segment}`;
    }
    return fetchImpl(url, init);
  };
  return createPirateApiClient(baseUrl, {
    ...options,
    // SAFETY: the SDK only invokes fetch; ApiFetch preserves that call shape.
    fetchImpl: canonicalFetch as typeof fetch,
  });
}

/** Route-specific client until the persona-aware generated client upgrade lands globally. */
export function createPublicCommunityRouteClient(
  options: CommunityRouteClientFactoryOptions = {},
): CommunityRouteApiClient {
  const origin = resolveOrigin(options.origin);
  const fetchImpl = options.fetchImpl ?? fetch;
  const rewriteFetch: ApiFetch = async (input, init) => {
    const generated = new URL(input instanceof Request ? input.url : input.toString());
    const rewritten = new URL(origin);
    rewritten.pathname = `/api${generated.pathname}`;
    rewritten.search = generated.search;
    return fetchImpl(rewritten, init);
  };
  return createCanonicalCommunityRouteClient(`${origin}/`, {
    credentials: "omit",
    fetchImpl: rewriteFetch,
  });
}
