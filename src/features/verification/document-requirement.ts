import type {
  GetCommunitiesCommunityIdJoinEligibilityResponse,
  GetHandleQualificationIntentsIntentIdResponse,
} from "@pirate/api-client";

export type DocumentProvider = "self.pass" | "zkpassport";
export type DocumentRequirement = Readonly<{
  kind: "pending";
  requirement: "nationality" | "age_18";
  requirementHash: string;
  intentId: string;
  providerId: DocumentProvider;
  acceptedProviderIds: readonly DocumentProvider[];
  generation: number;
}> | Readonly<{ kind: "satisfied" }>;

export class DocumentRequirementError extends Error {
  constructor() { super("verification_state_unavailable"); this.name = "DocumentRequirementError"; }
}
export function documentProviders(values: readonly unknown[], bound: unknown): readonly DocumentProvider[] {
  if (values.length !== 2 || !values.includes("self.pass") || !values.includes("zkpassport")
    || (bound !== "self.pass" && bound !== "zkpassport")) throw new DocumentRequirementError();
  // Preserve the server's order; both choices have the same visual prominence.
  return values.map(value => {
    if (value !== "self.pass" && value !== "zkpassport") throw new DocumentRequirementError();
    return value;
  });
}
export function pendingDocumentRequirement(input: Readonly<{
  requirement: "nationality" | "age_18";
  requirementHash: string;
  intentId: string;
  providerId: string;
  acceptedProviderIds: readonly unknown[];
  generation: number;
}>): Extract<DocumentRequirement, { kind: "pending" }> {
  const accepted = documentProviders(input.acceptedProviderIds, input.providerId);
  if (!input.intentId || !input.requirementHash || !Number.isSafeInteger(input.generation) || input.generation < 1
    || (input.providerId !== "self.pass" && input.providerId !== "zkpassport")) throw new DocumentRequirementError();
  return { ...input, kind: "pending", providerId: input.providerId, acceptedProviderIds: accepted };
}

export function joinNationalityRequirement(
  response: GetCommunitiesCommunityIdJoinEligibilityResponse,
  communityId: string,
): DocumentRequirement {
  if (response.community !== communityId || !("join_eligibility_version" in response)) throw new DocumentRequirementError();
  const progress = response.requirements.nationality;
  if (!progress || response.status === "banned" || response.status === "gate_failed") throw new DocumentRequirementError();
  if (progress.status === "satisfied") return { kind: "satisfied" };
  return pendingDocumentRequirement({
    requirement: "nationality", requirementHash: progress.requirement_hash,
    intentId: progress.ceremony_intent_id, providerId: progress.provider_id,
    acceptedProviderIds: progress.accepted_provider_ids, generation: progress.generation,
  });
}

export function handleNationalityRequirement(
  response: GetHandleQualificationIntentsIntentIdResponse,
  intentId: string,
  offeringId: string,
): DocumentRequirement {
  if (response.qualification_intent_id !== intentId || response.offering_id !== offeringId) throw new DocumentRequirementError();
  if (response.status === "qualified") return { kind: "satisfied" };
  return pendingDocumentRequirement({
    requirement: "nationality", requirementHash: response.requirement_hash,
    intentId: response.next_action.intent_id, providerId: response.next_action.provider_id,
    acceptedProviderIds: response.accepted_provider_ids, generation: response.next_action.generation,
  });
}
