/**
 * Initial provider-neutral gate slice surfaced by the picker. The creation
 * contract also supports nationality-allowed, gender-marker, erc721-collection,
 * inventory-match, and asset-ownership requirements, which are intentionally
 * not yet exposed here.
 */
export const GATE_KINDS = ["human-verification", "age-minimum", "reputation-score"] as const;
export type GateKind = (typeof GATE_KINDS)[number];

export type GateRequirement =
  | { requirement: "human-verification" }
  | { requirement: "age-minimum"; minimumAge: 18 }
  | { requirement: "reputation-score"; provider: "passport"; minimumScore: number };

export interface GateCatalogEntry {
  kind: GateKind;
  label: string;
  description: string;
}

export const GATE_CATALOG: readonly GateCatalogEntry[] = [
  {
    kind: "human-verification",
    label: "Palm scan",
    description: "Members verify with a palm scan before joining.",
  },
  {
    kind: "age-minimum",
    label: "Age minimum (18+)",
    description: "Members must be at least 18 years old.",
  },
  {
    kind: "reputation-score",
    label: "Reputation score",
    description: "Members need a minimum Passport reputation score to join.",
  },
];

export function compileGateRequirement(kind: GateKind): GateRequirement {
  switch (kind) {
    case "human-verification":
      return { requirement: "human-verification" };
    case "age-minimum":
      return { requirement: "age-minimum", minimumAge: 18 };
    case "reputation-score":
      return { requirement: "reputation-score", provider: "passport", minimumScore: 8 };
  }
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

export interface CreateCommunityDraft {
  /** Selected by the host's shared operation-level persona control. */
  personaId: string;
  name: string;
  description: string | null;
  policy: GatePolicy;
}

export function createEmptyDraft(personaId: string): CreateCommunityDraft {
  return {
    personaId,
    name: "",
    description: null,
    policy: compileGatePolicy([compileGateRequirement("human-verification")]),
  };
}

export function withDraftName(draft: CreateCommunityDraft, name: string): CreateCommunityDraft {
  return { ...draft, name };
}

export function withDraftDescription(draft: CreateCommunityDraft, description: string): CreateCommunityDraft {
  return { ...draft, description: description === "" ? null : description };
}

export function withDraftGates(draft: CreateCommunityDraft, kinds: readonly GateKind[]): CreateCommunityDraft {
  return { ...draft, policy: compileGatePolicy(kinds.map(compileGateRequirement)) };
}

export interface DraftValidation {
  nameError: string | null;
  valid: boolean;
}

export function validateDraft(draft: Pick<CreateCommunityDraft, "name">): DraftValidation {
  if (draft.name.trim().length === 0) {
    return { valid: false, nameError: "Name is required." };
  }
  return { valid: true, nameError: null };
}

export const createCommunityCopy = {
  title: "Create community",
  coverLabel: "Add cover",
  avatarLabel: "Avatar",
  chooseImage: "Choose image",
  nameLabel: "Name",
  namePlaceholder: "e.g. Signal Room",
  descriptionLabel: "Description",
  descriptionPlaceholder: "What is this community about?",
  gatesTitle: "Gates to join",
  addGate: "Add gate",
  closeGatePicker: "Close",
  selectedGatesLabel: "Selected gates",
  submit: "Create",
} as const;
