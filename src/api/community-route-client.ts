import {
  createPirateApiClient,
  type PirateApiClient,
} from "@pirate/api-client-community-route";
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
  return createPirateApiClient(`${origin}/`, {
    credentials: "omit",
    // SAFETY: ApiFetch has the standard call shape used by the generated client.
    fetchImpl: rewriteFetch as typeof fetch,
  });
}
