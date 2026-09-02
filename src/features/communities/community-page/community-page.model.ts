import type {
  GetCPathSegmentResponse,
  GetCommunitiesCommunityIdPreviewResponse,
} from "@pirate/api-client-happy-path";
import type { CommunityRouteApiClient } from "../../../api/community-route-client.ts";

export const COMMUNITY_ROUTE_UNAVAILABLE_STATUS = 502 as const;

export type CommunityRouteClient = CommunityRouteApiClient;

export type CommunityPageSuccess = Readonly<{
  readonly kind: "success";
  readonly status: 200;
  readonly requestedPathSegment: string;
  readonly canonicalPath: string;
  readonly canonicalUrl: string;
  readonly communityId: string;
  readonly routeFamily: "community_id" | "hns" | "spaces";
  readonly routeDisplay: string;
  readonly community: Readonly<{
    readonly displayName: string;
    readonly description: string | null;
    readonly avatarSrc?: string | null;
    readonly bannerSrc?: string | null;
    readonly membershipMode: "open" | "request" | "gated";
    readonly memberCount: number | null;
    readonly followerCount: number | null;
    readonly rules: readonly Readonly<{ readonly title: string; readonly body: string }>[];
  }>;
}>;

export type CommunityPageViewState =
  | CommunityPageSuccess
  | Readonly<{ readonly kind: "invalid"; readonly status: 400 }>
  | Readonly<{ readonly kind: "not-found"; readonly status: 404 }>
  | Readonly<{ readonly kind: "unavailable"; readonly status: 502 }>;

const optionalCommunityId =
  /^community_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const hnsRoot = /^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/u;
const spacesRoot = /^[a-z0-9-]+$/u;
const spacesPayload = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const hnsReservedRoots = new Set(["example", "invalid", "local", "localhost", "pirate", "test"]);
const utf8 = new TextEncoder();

/** Structural preflight only; api-next remains authoritative for ACE semantics. */
export function normalizeCommunityPathSegment(value: unknown): string | null {
  if (typeof value !== "string" || value === "" || value !== value.trim()) return null;
  if ([...value].some(character => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f || code > 0x7f;
  })) return null;
  if (value.includes("%") || value.includes("/") || value.includes("\\")) return null;
  if (optionalCommunityId.test(value)) return value;
  if (value.startsWith("@")) {
    const root = value.slice(1);
    const payload = root.startsWith("xn--") && root.length > 4 ? root.slice(4) : root;
    return utf8.encode(root).byteLength <= 62 && spacesRoot.test(root) && spacesPayload.test(payload)
      ? value
      : null;
  }
  return utf8.encode(value).byteLength <= 63 && hnsRoot.test(value) && !hnsReservedRoots.has(value)
    ? value
    : null;
}

function finiteCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function routeIdentity(
  response: GetCPathSegmentResponse,
  requestedPathSegment: string,
): Readonly<{
  readonly communityId: string;
  readonly routeFamily: CommunityPageSuccess["routeFamily"];
  readonly routeDisplay: string;
}> | null {
  if ("authority_version" in response) {
    if (
      response.authority_version !== "optional_route_v2" ||
      response.community_id !== requestedPathSegment ||
      response.href !== `/c/${requestedPathSegment}`
    ) return null;
    return {
      communityId: response.community_id,
      routeFamily: "community_id",
      routeDisplay: response.community_id,
    };
  }

  const route = response.canonical_route;
  const expectedFamily = requestedPathSegment.startsWith("@") ? "spaces" : "hns";
  const expectedRoot = expectedFamily === "spaces"
    ? requestedPathSegment.slice(1)
    : requestedPathSegment;
  if (
    route.path_segment !== requestedPathSegment ||
    route.href !== `/c/${requestedPathSegment}` ||
    route.family !== expectedFamily ||
    route.root_label !== expectedRoot ||
    (route.family === "hns" && route.app_host !== null && route.app_host !== `app.${expectedRoot}`) ||
    (route.family === "spaces" && route.app_host !== null)
  ) return null;
  return {
    communityId: response.community_id,
    routeFamily: route.family,
    routeDisplay: route.family === "hns" ? route.root_label_display : `@${route.root_label_display}`,
  };
}

export function projectCommunityPage(
  route: GetCPathSegmentResponse,
  preview: GetCommunitiesCommunityIdPreviewResponse,
  requestedPathSegment: string,
  canonicalOrigin?: string | URL,
): CommunityPageViewState {
  const identity = routeIdentity(route, requestedPathSegment);
  const displayName = preview.display_name.trim();
  if (
    identity === null ||
    preview.object !== "community_preview" ||
    preview.id !== identity.communityId ||
    displayName === ""
  ) return { kind: "unavailable", status: COMMUNITY_ROUTE_UNAVAILABLE_STATUS };

  const canonicalPath = `/c/${requestedPathSegment}`;
  return {
    kind: "success",
    status: 200,
    requestedPathSegment,
    canonicalPath,
    canonicalUrl: canonicalOrigin === undefined
      ? canonicalPath
      : new URL(canonicalPath, canonicalOrigin).toString(),
    communityId: identity.communityId,
    routeFamily: identity.routeFamily,
    routeDisplay: identity.routeDisplay,
    community: {
      displayName,
      description: preview.description?.trim() || null,
      avatarSrc: preview.avatar_ref ?? null,
      bannerSrc: preview.banner_ref ?? null,
      membershipMode: preview.membership_mode,
      memberCount: finiteCount(preview.member_count),
      followerCount: finiteCount(preview.follower_count),
      rules: preview.rules
        .filter(rule => rule.status === "active")
        .map(rule => ({ title: rule.title.trim(), body: rule.body.trim() }))
        .filter(rule => rule.title !== "" && rule.body !== ""),
    },
  };
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  // SAFETY: the `in` guard establishes an object with a possibly absent status field.
  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) ? status : undefined;
}

function protocolFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  // SAFETY: protocol errors are inspected only for these optional, non-sensitive discriminants.
  const record = error as { readonly _tag?: unknown; readonly name?: unknown };
  return record._tag === "ApiClientProtocolError" ||
    record._tag === "ApiClientResponseValidationError" ||
    record._tag === "ApiClientUnexpectedError" ||
    record.name === "ApiClientProtocolError" ||
    record.name === "ApiClientResponseValidationError" ||
    record.name === "ApiClientUnexpectedError";
}

export function mapCommunityPageError(error: unknown): CommunityPageViewState {
  if (protocolFailure(error)) return { kind: "unavailable", status: 502 };
  const status = errorStatus(error);
  if (status === 400) return { kind: "invalid", status: 400 };
  if (status === 404) return { kind: "not-found", status: 404 };
  return { kind: "unavailable", status: 502 };
}

export async function loadCommunityPage(
  client: CommunityRouteClient,
  rawPathSegment: unknown,
  canonicalOrigin?: string | URL,
): Promise<CommunityPageViewState> {
  const pathSegment = normalizeCommunityPathSegment(rawPathSegment);
  if (pathSegment === null) return { kind: "invalid", status: 400 };

  try {
    const route = await client.get_cPathSegment({ path: { path_segment: pathSegment } });
    const preview = await client.get_communitiesCommunityIdPreview({
      path: { communityId: route.community_id },
    });
    return projectCommunityPage(route, preview, pathSegment, canonicalOrigin);
  } catch (error: unknown) {
    return mapCommunityPageError(error);
  }
}
