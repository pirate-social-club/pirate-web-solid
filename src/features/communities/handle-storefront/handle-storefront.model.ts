import type {
  GetCommunitiesCommunityIdHandleOfferingsResponse,
  GetPersonasResponse,
} from "@pirate/api-client";

import type { PublicHandleSalesApiClient } from "../../../api/handle-sales-client.ts";
import {
  loadCommunityPage,
  type CommunityPageSuccess,
  type CommunityPageViewState,
  type CommunityRouteClient,
} from "../community-page/community-page.model.ts";

export type PublicHandleOffering =
  GetCommunitiesCommunityIdHandleOfferingsResponse["items"][number];
export type AccountPersona = GetPersonasResponse["personas"][number];

export type SupportedHandleOffering = PublicHandleOffering & Readonly<{
  readonly family: "hns";
  readonly fulfillment: Readonly<{ readonly kind: "hosted_persona_v1" }>;
  readonly pricing: Readonly<{
    readonly kind: "free_v1";
    readonly atomic_amount: "0";
  }>;
}>;

export type HandleStorefrontPublicSuccess = Readonly<{
  readonly kind: "success";
  readonly status: 200;
  readonly community: CommunityPageSuccess;
  readonly offerings: readonly SupportedHandleOffering[];
}>;

export type HandleStorefrontPublicState =
  | HandleStorefrontPublicSuccess
  | Exclude<CommunityPageViewState, CommunityPageSuccess>;

export type PersonaChoice = Readonly<{
  readonly personaId: string;
  readonly displayName: string;
  readonly avatarRef: string | null;
  readonly primaryPublicHandle: string | null;
  readonly shortId: string;
}>;

export type SaleNamespaceChoice = Readonly<{
  readonly activationId: string;
  readonly activationGeneration: number;
  readonly namespaceRoot: string;
  readonly displayRoot: string;
}>;

const labelGrammar = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const publicOfferingPageLimit = "100";
const maximumPublicOfferingPages = 100;

export function normalizeDesiredHandleLabel(value: unknown): string | null {
  if (typeof value !== "string" || value === "" || value !== value.trim()) return null;
  if (value.length > 63 || value !== value.toLowerCase() || !labelGrammar.test(value)) return null;
  return value;
}

export function isSupportedHandleOffering(
  offering: PublicHandleOffering,
): offering is SupportedHandleOffering {
  const supportedTerms = offering.label_scope.kind === "label_rule_v2"
    ? offering.allocation.kind === "first_come_v1"
      && offering.qualification_policy.kind === "none_v1"
      && Number.isInteger(offering.label_scope.availability.min_label_length)
      && Number.isInteger(offering.label_scope.availability.max_label_length)
      && offering.label_scope.availability.min_label_length >= 8
      && offering.label_scope.availability.max_label_length <= 32
      && offering.label_scope.availability.min_label_length
        <= offering.label_scope.availability.max_label_length
    : offering.allocation.kind === "direct_grant_v1"
      && offering.qualification_policy.kind === "curated_policy_v1"
      && normalizeDesiredHandleLabel(offering.label_scope.handle_label) !== null;
  return offering.status === "active"
    && offering.family === "hns"
    && offering.pricing.kind === "free_v1"
    && offering.pricing.atomic_amount === "0"
    && offering.fulfillment.kind === "hosted_persona_v1"
    && offering.issuance.family === "hns"
    && supportedTerms;
}

export function offeringAppliesToLabel(
  offering: SupportedHandleOffering,
  label: string,
): boolean {
  const normalized = normalizeDesiredHandleLabel(label);
  if (normalized === null) return false;
  if (offering.label_scope.kind === "exact_label_v2") {
    return offering.label_scope.handle_label === normalized;
  }
  const length = normalized.length;
  return length >= offering.label_scope.availability.min_label_length
    && length <= offering.label_scope.availability.max_label_length;
}

/** Pick a request context; api-next remains authoritative for effective-offering classification. */
export function selectHandleOffering(
  offerings: readonly SupportedHandleOffering[],
  label: string,
  activationId: string | null,
  requestedOfferingId?: string | null,
): SupportedHandleOffering | undefined {
  if (activationId === null) return undefined;
  const scoped = offerings.filter(offering => offering.sale_namespace_activation_id === activationId);
  const requested = requestedOfferingId === undefined || requestedOfferingId === null
    ? undefined
    : scoped.find(offering => offering.offering_id === requestedOfferingId);
  if (requested !== undefined) return requested;
  return scoped.find(offering =>
    offering.label_scope.kind === "exact_label_v2"
    && offeringAppliesToLabel(offering, label),
  ) ?? scoped.find(offering =>
    offering.label_scope.kind === "label_rule_v2"
    && offeringAppliesToLabel(offering, label),
  ) ?? scoped.find(offering => offering.label_scope.kind === "label_rule_v2")
    ?? scoped[0];
}

export function projectSaleNamespaceChoices(
  offerings: readonly SupportedHandleOffering[],
): readonly SaleNamespaceChoice[] {
  const choices = new Map<string, SaleNamespaceChoice>();
  for (const offering of offerings) {
    const choice = {
      activationId: offering.sale_namespace_activation_id,
      activationGeneration: offering.sale_namespace_activation_generation,
      namespaceRoot: offering.namespace_root,
      displayRoot: offering.display_root,
    };
    const prior = choices.get(choice.activationId);
    if (prior !== undefined && (
      prior.activationGeneration !== choice.activationGeneration
      || prior.namespaceRoot !== choice.namespaceRoot
      || prior.displayRoot !== choice.displayRoot
    )) {
      throw new Error("Handle offerings disagree on their sale namespace");
    }
    choices.set(choice.activationId, choice);
  }
  return [...choices.values()];
}

export function initialSaleNamespaceActivationId(
  offerings: readonly SupportedHandleOffering[],
  requestedOfferingId?: string | null,
): string | null {
  const requested = requestedOfferingId === undefined || requestedOfferingId === null
    ? undefined
    : offerings.find(offering => offering.offering_id === requestedOfferingId);
  if (requested !== undefined) return requested.sale_namespace_activation_id;
  const choices = projectSaleNamespaceChoices(offerings);
  return choices.length === 1 ? choices[0]?.activationId ?? null : null;
}

async function listSupportedHandleOfferings(
  client: PublicHandleSalesApiClient,
  communityId: string,
  stopAfterFirst = false,
): Promise<readonly SupportedHandleOffering[]> {
  const supported: SupportedHandleOffering[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < maximumPublicOfferingPages; pageNumber += 1) {
    const query = cursor === null
      ? { limit: publicOfferingPageLimit }
      : { limit: publicOfferingPageLimit, cursor };
    const page = await client.get_communitiesCommunityIdHandleOfferings({
      path: { communityId },
      query,
    });
    supported.push(...page.items
      .filter(isSupportedHandleOffering)
      .filter(offering => offering.community_id === communityId));
    if (stopAfterFirst && supported.length > 0) return supported;
    if (page.next_cursor === null) {
      projectSaleNamespaceChoices(supported);
      return supported;
    }
    if (page.next_cursor === "" || seenCursors.has(page.next_cursor)) {
      throw new Error("Handle offering pagination did not advance");
    }
    seenCursors.add(page.next_cursor);
    cursor = page.next_cursor;
  }
  throw new Error("Handle offering pagination exceeded the public bound");
}

export function initialHandleLabel(
  offerings: readonly SupportedHandleOffering[],
  label: string | null | undefined,
  requestedOfferingId?: string | null,
): string {
  const normalized = normalizeDesiredHandleLabel(label);
  if (normalized !== null) return normalized;
  const requested = requestedOfferingId
    ? offerings.find(offering => offering.offering_id === requestedOfferingId)
    : undefined;
  return requested?.label_scope.kind === "exact_label_v2"
    ? requested.label_scope.handle_label
    : "";
}

export function projectPersonaChoices(response: GetPersonasResponse): readonly PersonaChoice[] {
  const eligible = response.personas.filter(persona =>
    persona.status === "active"
    && persona.persona_id !== ""
    && persona.profile.persona_id === persona.persona_id,
  );
  const personas = [...new Map(eligible.map(persona => [persona.persona_id, persona])).values()];
  const personaIds = personas.map(persona => persona.persona_id);
  return personas.map(persona => {
    const displayName = persona.profile.display_name?.trim()
      || persona.profile.primary_public_handle?.trim()
      || "Unnamed persona";
    let suffixLength = Math.min(6, persona.persona_id.length);
    while (
      suffixLength < persona.persona_id.length
      && personaIds.some(candidate =>
        candidate !== persona.persona_id
        && candidate.endsWith(persona.persona_id.slice(-suffixLength)),
      )
    ) suffixLength += 1;
    return {
      personaId: persona.persona_id,
      displayName,
      avatarRef: persona.profile.avatar_ref,
      primaryPublicHandle: persona.profile.primary_public_handle,
      shortId: `…${persona.persona_id.slice(-suffixLength)}`,
    };
  });
}

function mapStorefrontFailure(error: unknown): HandleStorefrontPublicState {
  if (typeof error === "object" && error !== null && "status" in error) {
    // SAFETY: the object and status property were both established before this access.
    const status = (error as { readonly status?: unknown }).status;
    if (status === 404) return { kind: "not-found", status: 404 };
  }
  return { kind: "unavailable", status: 502 };
}

export async function loadHandleStorefrontPublic(
  communityClient: CommunityRouteClient,
  handleClient: PublicHandleSalesApiClient,
  rawPathSegment: unknown,
  canonicalOrigin?: string | URL,
): Promise<HandleStorefrontPublicState> {
  const community = await loadCommunityPage(
    communityClient,
    rawPathSegment,
    canonicalOrigin,
  );
  if (community.kind !== "success") return community;

  try {
    return {
      kind: "success",
      status: 200,
      community,
      offerings: await listSupportedHandleOfferings(handleClient, community.communityId),
    };
  } catch (error: unknown) {
    return mapStorefrontFailure(error);
  }
}

/** CTA discovery is fail-closed and never changes the public community response. */
export async function hasActiveHandleStorefront(
  client: PublicHandleSalesApiClient,
  communityId: string,
): Promise<boolean> {
  try {
    return (await listSupportedHandleOfferings(client, communityId, true)).length > 0;
  } catch {
    return false;
  }
}
