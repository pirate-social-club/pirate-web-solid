import { normalizeIdentityCountryAlpha2 } from "../../verification/nationality-country-codes.ts";
import type { GeneratedLocaleCatalogs } from "../../../locales/generated";
import type { CommunityPersonaChoice } from "../../identity/community-persona-choice";
import { randomAvatarSeed } from "./generated-avatar";
import { generatedPublicName } from "./generated-name";

/**
 * A subset of api-next's `CompiledGateRequirement`
 * (packages/contracts/src/community-creation.ts): the members this client
 * knows how to compile, each shaped exactly as the contract declares it. The
 * wire union reserves more requirement kinds. Nationality is allowlist-only;
 * reputation-score remains historical scaffolding without an authoring control.
 */
export type HumanVerificationRequirement = { requirement: "human-verification" };
export type NationalityRequirement = { requirement: "nationality-allowed"; allowedCountries: string[] };
export type AdditionalGateRequirement = NationalityRequirement | {
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
  if (left.requirement === "nationality-allowed" || right.requirement === "nationality-allowed") {
    if (left.requirement !== "nationality-allowed" || right.requirement !== "nationality-allowed") return false;
    const canonical = (values: readonly string[]) => [...new Set(values.map(value => normalizeIdentityCountryAlpha2(value) ?? value))].sort().join(",");
    return canonical(left.allowedCountries) === canonical(right.allowedCountries);
  }
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

/**
 * Composes the current wire contract: the unique-human membership baseline
 * plus any additional gates, which the API still treats as one conjunctive
 * policy.
 *
 * TODO(api-community-document-only-join-policy): package B defines the
 * document-only wire shape. Until then the Palm baseline stays in the
 * composition exactly as the current contract expects; do not change it from
 * the UI alone.
 */
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
  /** Optional server-owned avatar assets prepared for this creation intent. */
  communityAvatarRef?: string;
  personaAvatarRef?: string;
  /**
   * Client-only seed for the locally generated profile-avatar default
   * (Spec 014 §3.1). It is rasterized before an optional upload.
   */
  profileAvatarSeed: string;
}

export function createEmptyDraft(persona: CommunityPersonaChoice | undefined): CreateCommunityDraft {
  return {
    persona: persona ?? { kind: "create_new" },
    // Prefilled suggestion per Spec 014 §3.1 as amended 2026-09-20.
    publicName: generatedPublicName(),
    name: "",
    description: null,
    additionalRequirements: [],
    profileAvatarSeed: randomAvatarSeed(),
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
