import type { GeneratedLocaleCatalogs } from "../../../locales/generated";

/**
 * A subset of api-next's `CompiledGateRequirement`
 * (packages/contracts/src/community-creation.ts): the members this client
 * knows how to compile, each shaped exactly as the contract declares it. The
 * wire union reserves more requirement kinds, but the creation client exposes
 * only entries offered by the backend capability catalog.
 */
export type HumanVerificationRequirement = { requirement: "human-verification" };
export type AdditionalGateRequirement = {
  requirement: "reputation-score";
  provider: "passport";
  minimumScore: number;
};
export type GateRequirement = HumanVerificationRequirement | AdditionalGateRequirement;

export type GateKind = GateRequirement["requirement"];

/** The only requirement the client composes itself; it carries no parameters. */
export const HUMAN_VERIFICATION: HumanVerificationRequirement = { requirement: "human-verification" };

/**
 * One additional gate the server offers this operator, already configured.
 *
 * The requirement arrives complete because the client has no way to choose a
 * minimum age or score: it would be inventing a threshold the operator never
 * set. Spec 010 §2 also requires unsupported gates to be hidden in production
 * rather than shown disabled, so an option only reaches the client once the
 * backend capability catalog offers it.
 */
export interface AdditionalGateOption {
  requirement: AdditionalGateRequirement;
  label: string;
  description: string;
}

export function gateKindOf(requirement: GateRequirement): GateKind {
  return requirement.requirement;
}

/**
 * Structural equality over the closed requirement union.
 *
 * Selection compares the whole configured value, not just the kind: a catalog
 * may offer Passport score 8+ and Passport score 20+ at once, and selecting
 * one must not select or replace the other.
 */
export function requirementsEqual(
  left: AdditionalGateRequirement,
  right: AdditionalGateRequirement,
): boolean {
  return left.provider === right.provider && left.minimumScore === right.minimumScore;
}

export function hasRequirement(
  requirements: readonly AdditionalGateRequirement[],
  requirement: AdditionalGateRequirement,
): boolean {
  return requirements.some((entry) => requirementsEqual(entry, requirement));
}

export interface GateAccessPath {
  id: string;
  operator: "and";
  requirements: [HumanVerificationRequirement, ...AdditionalGateRequirement[]];
}

export interface GatePolicy {
  version: 1;
  accessPaths: [GateAccessPath];
}

export function gateKindsOf(policy: GatePolicy): GateKind[] {
  return policy.accessPaths[0].requirements.map((requirement) => requirement.requirement);
}

/** Every community requires unique-human membership; other gates are additive. */
export function compileMembershipPolicy(
  additionalRequirements: readonly AdditionalGateRequirement[] = [],
): GatePolicy {
  return {
    version: 1,
    accessPaths: [{ id: "default", operator: "and", requirements: [HUMAN_VERIFICATION, ...additionalRequirements] }],
  };
}

export interface CreateCommunityDraft {
  /** Selected by the host's shared operation-level persona control. */
  personaId: string;
  name: string;
  description: string | null;
  /** Configured requirements appended to the mandatory human baseline. */
  additionalRequirements: AdditionalGateRequirement[];
}

export function createEmptyDraft(personaId: string): CreateCommunityDraft {
  return {
    personaId,
    name: "",
    description: null,
    additionalRequirements: [],
  };
}

export function withDraftName(draft: CreateCommunityDraft, name: string): CreateCommunityDraft {
  return { ...draft, name };
}

export function withDraftDescription(draft: CreateCommunityDraft, description: string): CreateCommunityDraft {
  return { ...draft, description: description === "" ? null : description };
}

export function withDraftPersona(draft: CreateCommunityDraft, personaId: string): CreateCommunityDraft {
  return { ...draft, personaId };
}

export function withAdditionalRequirements(
  draft: CreateCommunityDraft,
  requirements: readonly AdditionalGateRequirement[],
): CreateCommunityDraft {
  return { ...draft, additionalRequirements: [...requirements] };
}

/** The policy this draft would commit, for review and for the commit payload. */
export function draftGatePolicy(draft: CreateCommunityDraft): GatePolicy {
  return compileMembershipPolicy(draft.additionalRequirements);
}

export type CreateCommunityCopy = {
  [Key in keyof GeneratedLocaleCatalogs["en"]["routes"]["createCommunity"]]: string;
};

export interface DraftValidation {
  nameError: string | null;
  valid: boolean;
}

export function validateDraft(
  draft: Pick<CreateCommunityDraft, "name">,
  copy: CreateCommunityCopy,
): DraftValidation {
  const nameError = draft.name.trim().length === 0 ? copy.nameRequired : null;
  return { nameError, valid: nameError === null };
}
