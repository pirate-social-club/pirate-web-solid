import type { GetPublicProfilesHandleResponse, PirateApiClient } from "@pirate/api-client-happy-path";

export const PUBLIC_PROFILE_UNAVAILABLE_STATUS = 502 as const;

export type PublicProfileClient = Pick<PirateApiClient, "get_publicProfilesHandle">;

export type PublicProfileCommunity = Readonly<{
  readonly name: string;
  readonly href?: string;
}>;

export type PublicProfileSuccess = Readonly<{
  readonly kind: "success";
  readonly status: 200;
  readonly requestedHandle: string;
  readonly canonicalHandle: string;
  readonly canonicalPath: string;
  readonly isCanonical: boolean;
  readonly profile: Readonly<{
    readonly displayName: string | null;
    readonly handle: string;
    readonly bio: string | null;
  }>;
  readonly communities: readonly PublicProfileCommunity[];
}>;

export type PublicProfileViewState =
  | PublicProfileSuccess
  | Readonly<{ readonly kind: "invalid"; readonly status: 400 }>
  | Readonly<{ readonly kind: "not-found"; readonly status: 404 }>
  | Readonly<{ readonly kind: "unavailable"; readonly status: 502 }>;

export type NormalizedPirateHandle = Readonly<{
  readonly stem: string;
  readonly labelDisplay: string;
}>;

/** Keep this in lockstep with api-next's public Pirate-handle boundary. */
export function normalizePirateHandle(value: unknown): NormalizedPirateHandle | null {
  if (typeof value !== "string") return null;
  if ([...value].some(character => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f || code > 0x7f;
  })) return null;

  const lower = value.trim().toLowerCase().replace(/^@+/u, "");
  const stem = lower.endsWith(".pirate") ? lower.slice(0, -".pirate".length) : lower;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(stem) || stem.length > 32) return null;
  return { stem, labelDisplay: `${stem}.pirate` };
}

export function buildPublicProfilePath(handleLabel: string): string {
  return `/u/${encodeURIComponent(handleLabel)}`;
}

export function buildCommunityPath(routeSlug: string): string | undefined {
  const slug = routeSlug.trim();
  if (slug === "" || [...slug].some(character => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  })) return undefined;
  return `/c/${encodeURIComponent(slug)}`;
}

function unavailable() {
  return { kind: "unavailable", status: PUBLIC_PROFILE_UNAVAILABLE_STATUS } as const;
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  // SAFETY: the `in` guard above establishes an object with a possibly absent status field.
  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) ? status : undefined;
}

function isProtocolFailure(error: unknown): boolean {
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

/** Convert transport/protocol failures into a safe UI state without serializing error data. */
export function mapPublicProfileError(error: unknown): PublicProfileViewState {
  if (isProtocolFailure(error)) return unavailable();
  const status = errorStatus(error);
  if (status === 400) return { kind: "invalid", status: 400 };
  if (status === 404) return { kind: "not-found", status: 404 };
  return unavailable();
}

function projectCommunity(
  community: GetPublicProfilesHandleResponse["created_communities"][number],
): PublicProfileCommunity | null {
  const name = typeof community.display_name === "string" ? community.display_name.trim() : "";
  if (name === "") return null;
  return {
    name,
    ...(typeof community.route_slug === "string"
      ? { href: buildCommunityPath(community.route_slug) }
      : {}),
  };
}

/** Project only fields accepted by the standalone anonymous profile surface. */
export function projectPublicProfile(
  response: GetPublicProfilesHandleResponse,
  requested: NormalizedPirateHandle,
): PublicProfileViewState {
  const profile = response.profile;
  const requestedResponse = normalizePirateHandle(response.requested_handle_label);
  const resolved = normalizePirateHandle(profile.global_handle.label);
  if (
    profile.object !== "profile" ||
    profile.global_handle.object !== "global_handle" ||
    profile.global_handle.status !== "active" ||
    requestedResponse === null ||
    requestedResponse.stem !== requested.stem ||
    response.requested_handle_label !== requested.labelDisplay ||
    resolved === null ||
    response.resolved_handle_label !== profile.global_handle.label ||
    (response.is_canonical !== (requested.stem === resolved.stem))
  ) return unavailable();

  const communities: PublicProfileCommunity[] = [];
  for (const community of response.created_communities) {
    const projected = projectCommunity(community);
    if (projected !== null) communities.push(projected);
  }

  return {
    kind: "success",
    status: 200,
    requestedHandle: requested.labelDisplay,
    canonicalHandle: resolved.labelDisplay,
    canonicalPath: buildPublicProfilePath(resolved.labelDisplay),
    isCanonical: response.is_canonical,
    profile: {
      displayName: profile.display_name?.trim() || null,
      handle: resolved.labelDisplay,
      bio: profile.bio?.trim() || null,
    },
    communities,
  };
}

export async function loadPublicProfile(
  client: PublicProfileClient,
  rawHandle: unknown,
): Promise<PublicProfileViewState> {
  const requested = normalizePirateHandle(rawHandle);
  if (requested === null) return { kind: "invalid", status: 400 };

  try {
    const response = await client.get_publicProfilesHandle({ path: { handle: requested.stem } });
    return projectPublicProfile(response, requested);
  } catch (error: unknown) {
    return mapPublicProfileError(error);
  }
}
