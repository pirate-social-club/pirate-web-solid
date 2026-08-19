export const FUNDING_HARNESS_CONFIG_PATH = "/internal/funding-harness/config" as const;

export interface FundingHarnessConfigEnvironment {
  readonly FUNDING_HARNESS_ENABLED?: string;
  readonly FUNDING_HARNESS_COMMUNITY_ID?: string;
  readonly FUNDING_HARNESS_LISTING_ID?: string;
}

export interface FundingHarnessPublicConfig {
  readonly enabled: true;
  readonly communityId: string;
  readonly listingId: string;
}

function validIdentifier(value: string | undefined): value is string {
  return value !== undefined && value.length > 0 && value.length <= 256 && value === value.trim();
}

/**
 * The funding quote harness exists so the reload-safe quote panel can be
 * exercised against staging fixtures. It is enabled only where the flag and
 * both fixture identifiers are configured; production never sets them.
 */
export function publicFundingHarnessConfig(
  env: FundingHarnessConfigEnvironment,
): FundingHarnessPublicConfig | undefined {
  if (env.FUNDING_HARNESS_ENABLED !== "true") return undefined;
  if (!validIdentifier(env.FUNDING_HARNESS_COMMUNITY_ID)) return undefined;
  if (!validIdentifier(env.FUNDING_HARNESS_LISTING_ID)) return undefined;
  return {
    enabled: true,
    communityId: env.FUNDING_HARNESS_COMMUNITY_ID,
    listingId: env.FUNDING_HARNESS_LISTING_ID,
  };
}

export function fundingHarnessConfigResponse(
  request: Request,
  env: FundingHarnessConfigEnvironment,
): Response {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  }
  const config = publicFundingHarnessConfig(env);
  if (config === undefined) return new Response(null, { status: 404 });
  return Response.json(config, {
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

export type FundingHarnessConfigFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function fetchFundingHarnessConfig(
  fetchImpl: FundingHarnessConfigFetch = fetch,
): Promise<FundingHarnessPublicConfig> {
  const response = await fetchImpl(FUNDING_HARNESS_CONFIG_PATH, {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("funding_harness_unavailable");
  const value: unknown = await response.json();
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("funding_harness_unavailable");
  }
  // SAFETY: object/null/array representation was checked above; every accepted
  // property is independently parsed before the named config is constructed.
  const input = value as { enabled?: unknown; communityId?: unknown; listingId?: unknown };
  if (Object.keys(value).sort().join(",") !== "communityId,enabled,listingId") {
    throw new Error("funding_harness_unavailable");
  }
  const communityId = typeof input.communityId === "string" ? input.communityId : undefined;
  const listingId = typeof input.listingId === "string" ? input.listingId : undefined;
  if (input.enabled !== true || !validIdentifier(communityId) || !validIdentifier(listingId)) {
    throw new Error("funding_harness_unavailable");
  }
  return { enabled: true, communityId, listingId };
}
