import type {
  GetPublicPersonasPersonaIdResponse,
  PirateApiClient,
} from "@pirate/api-client-happy-path";

export const CANONICAL_PUBLIC_ORIGIN = "https://pirate.sc" as const;

export type PersonaPublicProfileClient = Pick<PirateApiClient, "get_publicPersonasPersonaId">;
export type PublicPersonaGrant = GetPublicPersonasPersonaIdResponse["handle_grants"][number];

export type PersonaPublicProfileSuccess = Readonly<{
  readonly kind: "success";
  readonly status: 200;
  readonly canonicalUrl: string;
  readonly response: GetPublicPersonasPersonaIdResponse;
}>;

export type PersonaPublicProfileState =
  | PersonaPublicProfileSuccess
  | Readonly<{ readonly kind: "invalid"; readonly status: 400 }>
  | Readonly<{ readonly kind: "method-not-allowed"; readonly status: 405 }>
  | Readonly<{ readonly kind: "not-found"; readonly status: 404 }>
  | Readonly<{ readonly kind: "unavailable"; readonly status: 502 }>;

const personaIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const encoder = new TextEncoder();

export function isPublicPersonaId(value: unknown): value is string {
  return typeof value === "string" && personaIdPattern.test(value) && encoder.encode(value).byteLength <= 256;
}

export function canonicalPersonaPath(personaId: string): string {
  return `/p/${encodeURIComponent(personaId)}`;
}

export function canonicalPersonaUrl(personaId: string): string {
  return new URL(canonicalPersonaPath(personaId), CANONICAL_PUBLIC_ORIGIN).toString();
}

function bytewise(left: string, right: string): number {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.min(a.byteLength, b.byteLength);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return a.byteLength - b.byteLength;
}

export function comparePublicPersonaGrants(left: PublicPersonaGrant, right: PublicPersonaGrant): number {
  for (const [a, b] of [
    [left.handle.family, right.handle.family],
    [left.handle.namespace_root, right.handle.namespace_root],
    [left.handle.handle_label, right.handle.handle_label],
    [left.grant_id, right.grant_id],
  ] as const) {
    const order = bytewise(a, b);
    if (order !== 0) return order;
  }
  return 0;
}

function samePersona(
  left: GetPublicPersonasPersonaIdResponse["persona"],
  right: GetPublicPersonasPersonaIdResponse["persona"],
): boolean {
  return left.persona_id === right.persona_id &&
    left.object === right.object &&
    left.display_name === right.display_name &&
    left.avatar_ref === right.avatar_ref &&
    left.primary_public_handle === right.primary_public_handle;
}

/** Enforce the cross-row privacy and ordering invariants above the generated wire validator. */
export function projectPersonaPublicProfile(
  response: GetPublicPersonasPersonaIdResponse,
  expectedPersonaId: string,
): PersonaPublicProfileState {
  if (
    response.persona.object !== "persona" ||
    response.persona.persona_id !== expectedPersonaId ||
    !isPublicPersonaId(response.persona.persona_id) ||
    response.profile.revision < 1
  ) {
    return { kind: "unavailable", status: 502 };
  }
  for (let index = 0; index < response.handle_grants.length; index += 1) {
    const grant = response.handle_grants[index];
    const previous = response.handle_grants[index - 1];
    if (
      grant === undefined ||
      !samePersona(response.persona, grant.owner_persona) ||
      (previous !== undefined && comparePublicPersonaGrants(previous, grant) >= 0)
    ) {
      return { kind: "unavailable", status: 502 };
    }
  }
  return {
    kind: "success",
    status: 200,
    canonicalUrl: canonicalPersonaUrl(expectedPersonaId),
    response,
  };
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  // SAFETY: the `in` guard establishes an object carrying only an unknown
  // status field, which is validated immediately below.
  const status = (error as { readonly status?: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) ? status : undefined;
}

export async function loadPersonaPublicProfile(
  client: PersonaPublicProfileClient,
  rawPersonaId: unknown,
): Promise<PersonaPublicProfileState> {
  if (!isPublicPersonaId(rawPersonaId)) return { kind: "invalid", status: 400 };
  try {
    const response = await client.get_publicPersonasPersonaId({ path: { personaId: rawPersonaId } });
    return projectPersonaPublicProfile(response, rawPersonaId);
  } catch (error: unknown) {
    return errorStatus(error) === 404
      ? { kind: "not-found", status: 404 }
      : { kind: "unavailable", status: 502 };
  }
}
