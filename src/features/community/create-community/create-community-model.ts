import type { GeneratedLocaleCatalogs } from "../../../locales/generated";
import type { CommunityPersonaChoice } from "../../identity/community-persona-choice";

/**
 * A subset of api-next's `CompiledGateRequirement`
 * (packages/contracts/src/community-creation.ts): the members this client
 * knows how to compile, each shaped exactly as the contract declares it. The
 * wire union reserves more requirement kinds; this client carries the
 * reputation-score subset for contract parity and never composes a configured
 * gate itself, so that surface is dormant scaffolding.
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
 * Structural equality over the closed requirement union.
 *
 * Comparison covers the whole configured value, not just the kind: two
 * Passport thresholds are different requirements, and one must not replace or
 * stand in for the other.
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
  /**
   * The closed persona choice every creation intent carries (spec 014 §11.2):
   * an existing active persona the creator designates, or `create_new` to have
   * the server reserve and activate a fresh profile before publishing.
   * Undefined while choosing among multiple existing profiles.
   */
  persona: CommunityPersonaChoice | undefined;
  name: string;
  publicName?: string;
  description: string | null;
  /** Configured requirements appended to the mandatory human baseline. */
  additionalRequirements: AdditionalGateRequirement[];
}

export function createEmptyDraft(persona: CommunityPersonaChoice | undefined): CreateCommunityDraft {
  return {
    persona: persona ?? { kind: "create_new" },
    publicName: "",
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

export function withDraftPersona(
  draft: CreateCommunityDraft,
  persona: CommunityPersonaChoice,
): CreateCommunityDraft {
  return { ...draft, persona };
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
  personaError: string | null;
  publicNameError: string | null;
  valid: boolean;
}

export function validateDraft(
  draft: Pick<CreateCommunityDraft, "name" | "persona" | "publicName">,
  copy: CreateCommunityCopy,
): DraftValidation {
  const nameError = draft.name.trim().length === 0 ? copy.nameRequired : null;
  const personaError = draft.persona === undefined
    ? "Choose the persona this community presents before continuing."
    : null;
  const publicName = draft.publicName?.trim() ?? "";
  const publicNameError = draft.persona?.kind === "create_new" && (publicName.length === 0 || publicName.length > 80 || [...publicName].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    ? "Enter a public name of up to 80 characters." : null;
  return { nameError, personaError, publicNameError, valid: nameError === null && personaError === null && publicNameError === null };
}
