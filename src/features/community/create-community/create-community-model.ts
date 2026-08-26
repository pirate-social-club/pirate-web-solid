import type { GeneratedLocaleCatalogs } from "../../../locales/generated";

/**
 * Spec 010 §2 names the three join-policy choices offered during creation.
 * They describe who may join the community and are independent of the
 * creator's own `human_identity` requirement, which spec 012 §3 attaches to the
 * creation intent rather than to the community's gate policy.
 */
export const JOIN_POLICY_CHOICES = ["everyone", "verified", "advanced"] as const;
export type JoinPolicyChoice = (typeof JOIN_POLICY_CHOICES)[number];

/**
 * A subset of api-next's `CompiledGateRequirement`
 * (packages/contracts/src/community-creation.ts): the members this client
 * knows how to compile, each shaped exactly as the contract declares it.
 * `minimumAge` is frozen at 18 there; only `minimumScore` is operator-chosen.
 * Do not widen a member here without changing the contract first.
 */
export type GateRequirement =
  | { requirement: "human-verification" }
  | { requirement: "age-minimum"; minimumAge: 18 }
  | { requirement: "reputation-score"; provider: "passport"; minimumScore: number };

export type GateKind = GateRequirement["requirement"];

/** The only requirement the client composes itself; it carries no parameters. */
export const HUMAN_VERIFICATION: GateRequirement = { requirement: "human-verification" };

/**
 * One advanced gate the server offers this operator, already configured.
 *
 * The requirement arrives complete because the client has no way to choose a
 * minimum age or score: it would be inventing a threshold the operator never
 * set. Spec 010 §2 also requires unsupported gates to be hidden in production
 * rather than shown disabled, so an option only reaches the client once the
 * backend capability catalog offers it.
 */
export interface AdvancedGateOption {
  requirement: GateRequirement;
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
 * may offer "18 or older" and "21 or older" at once, and a resumed draft
 * holding 18+ must not light up a newly offered 21+ option while still
 * committing 18+.
 */
export function requirementsEqual(left: GateRequirement, right: GateRequirement): boolean {
  switch (left.requirement) {
    case "human-verification":
      return right.requirement === "human-verification";
    case "age-minimum":
      return right.requirement === "age-minimum" && left.minimumAge === right.minimumAge;
    case "reputation-score":
      return right.requirement === "reputation-score"
        && left.provider === right.provider
        && left.minimumScore === right.minimumScore;
  }
}

export function hasRequirement(
  requirements: readonly GateRequirement[],
  requirement: GateRequirement,
): boolean {
  return requirements.some((entry) => requirementsEqual(entry, requirement));
}

export interface GateAccessPath {
  id: string;
  operator: "and";
  requirements: GateRequirement[];
}

export interface GatePolicy {
  version: 1;
  accessPaths: [GateAccessPath];
}

export function compileGatePolicy(requirements: readonly GateRequirement[]): GatePolicy {
  return {
    version: 1,
    accessPaths: [{ id: "default", operator: "and", requirements: [...requirements] }],
  };
}

export function gateKindsOf(policy: GatePolicy): GateKind[] {
  return policy.accessPaths[0].requirements.map((requirement) => requirement.requirement);
}

/**
 * Compile the reviewed choice into the canonical policy. `everyone` carries no
 * requirements at all: an open community is not a verified one whose member
 * happens to have passed already.
 */
export function compileJoinPolicy(
  choice: JoinPolicyChoice,
  advancedRequirements: readonly GateRequirement[] = [],
): GatePolicy {
  switch (choice) {
    case "everyone":
      return compileGatePolicy([]);
    case "verified":
      return compileGatePolicy([HUMAN_VERIFICATION]);
    case "advanced":
      return compileGatePolicy(advancedRequirements);
  }
}

export interface CreateCommunityDraft {
  /** Selected by the host's shared operation-level persona control. */
  personaId: string;
  name: string;
  description: string | null;
  joinPolicy: JoinPolicyChoice;
  /** Configured requirements chosen from the offered catalog; advanced only. */
  advancedRequirements: GateRequirement[];
}

export function createEmptyDraft(personaId: string): CreateCommunityDraft {
  return {
    personaId,
    name: "",
    description: null,
    joinPolicy: "verified",
    advancedRequirements: [],
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

export function withJoinPolicy(draft: CreateCommunityDraft, choice: JoinPolicyChoice): CreateCommunityDraft {
  return choice === "advanced"
    ? { ...draft, joinPolicy: choice }
    : { ...draft, joinPolicy: choice, advancedRequirements: [] };
}

export function withAdvancedRequirements(
  draft: CreateCommunityDraft,
  requirements: readonly GateRequirement[],
): CreateCommunityDraft {
  return { ...draft, joinPolicy: "advanced", advancedRequirements: [...requirements] };
}

/** The policy this draft would commit, for review and for the commit payload. */
export function draftGatePolicy(draft: CreateCommunityDraft): GatePolicy {
  return compileJoinPolicy(draft.joinPolicy, draft.advancedRequirements);
}

export type CreateCommunityCopy = {
  [Key in keyof GeneratedLocaleCatalogs["en"]["routes"]["createCommunity"]]: string;
};

export interface DraftValidation {
  nameError: string | null;
  advancedError: string | null;
  valid: boolean;
}

export function validateDraft(
  draft: Pick<CreateCommunityDraft, "name" | "joinPolicy" | "advancedRequirements">,
  copy: CreateCommunityCopy,
): DraftValidation {
  const nameError = draft.name.trim().length === 0 ? copy.nameRequired : null;
  const advancedError =
    draft.joinPolicy === "advanced" && draft.advancedRequirements.length === 0
      ? copy.advancedEmpty
      : null;
  return { nameError, advancedError, valid: nameError === null && advancedError === null };
}
