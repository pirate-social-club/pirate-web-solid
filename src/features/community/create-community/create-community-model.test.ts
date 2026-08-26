import { describe, expect, test } from "bun:test";

import { getLocaleMessages } from "../../../locales";
import {
  compileGatePolicy,
  compileJoinPolicy,
  createEmptyDraft,
  draftGatePolicy,
  gateKindsOf,
  hasRequirement,
  HUMAN_VERIFICATION,
  requirementsEqual,
  validateDraft,
  withAdvancedRequirements,
  withDraftDescription,
  withDraftName,
  withDraftPersona,
  withJoinPolicy,
  type AdvancedGateOption,
  type CreateCommunityCopy,
  type GateRequirement,
} from "./create-community-model";

// SAFETY: the generated routes catalog guarantees the createCommunity key shape for every UI locale.
const copy = getLocaleMessages("en", "routes").createCommunity as CreateCommunityCopy;

const ageGate: AdvancedGateOption = {
  requirement: { requirement: "age-minimum", minimumAge: 18 },
  label: "18 or older",
  description: "Members must have a verified age of at least 18.",
};
const scoreGate: AdvancedGateOption = {
  requirement: { requirement: "reputation-score", provider: "passport", minimumScore: 8 },
  label: "Passport score 8+",
  description: "Members must have a Passport reputation score of at least 8.",
};

describe("create community model", () => {
  test("wraps requirements in an AND policy", () => {
    expect(compileGatePolicy([HUMAN_VERIFICATION])).toEqual({
      version: 1,
      accessPaths: [{ id: "default", operator: "and", requirements: [{ requirement: "human-verification" }] }],
    });
  });

  test("derives ordered gate kinds from a compiled policy", () => {
    const policy = compileGatePolicy([HUMAN_VERIFICATION, ageGate.requirement]);
    expect(gateKindsOf(policy)).toEqual(["human-verification", "age-minimum"]);
    expect(gateKindsOf(compileGatePolicy([]))).toEqual([]);
  });

  // Spec 010 §2: the three choices are Everyone, Verified people, Advanced.
  test("compiles each join-policy choice", () => {
    expect(gateKindsOf(compileJoinPolicy("everyone"))).toEqual([]);
    expect(gateKindsOf(compileJoinPolicy("verified"))).toEqual(["human-verification"]);
    expect(compileJoinPolicy("advanced", [ageGate.requirement, scoreGate.requirement]).accessPaths[0].requirements)
      .toEqual([
        { requirement: "age-minimum", minimumAge: 18 },
        { requirement: "reputation-score", provider: "passport", minimumScore: 8 },
      ]);
  });

  // The client never invents a threshold: the offered requirement is committed
  // exactly as the capability catalog supplied it.
  test("commits the offered requirement verbatim", () => {
    const offered: GateRequirement = { requirement: "reputation-score", provider: "passport", minimumScore: 20 };
    const draft = withAdvancedRequirements(createEmptyDraft("persona_1"), [offered]);
    expect(draftGatePolicy(draft).accessPaths[0].requirements).toEqual([offered]);
  });

  // The creator's own human_identity requirement lives on the creation intent
  // (spec 012 §3), so an open community commits no member requirement at all.
  test("everyone commits an empty member policy", () => {
    const draft = withJoinPolicy(createEmptyDraft("persona_1"), "everyone");
    expect(draftGatePolicy(draft).accessPaths[0].requirements).toEqual([]);
  });

  test("defaults to the recommended verified choice", () => {
    const draft = createEmptyDraft("persona_1");
    expect(draft.name).toBe("");
    expect(draft.joinPolicy).toBe("verified");
    expect(draft.advancedRequirements).toEqual([]);
    expect(gateKindsOf(draftGatePolicy(draft))).toEqual(["human-verification"]);
  });

  test("validates a trimmed name", () => {
    const draft = createEmptyDraft("persona_1");
    expect(validateDraft(draft, copy)).toEqual({
      valid: false,
      nameError: "Name is required.",
      advancedError: null,
    });
    expect(validateDraft({ ...draft, name: "   " }, copy).valid).toBe(false);
    expect(validateDraft({ ...draft, name: "  Signal Room  " }, copy)).toEqual({
      valid: true,
      nameError: null,
      advancedError: null,
    });
  });

  test("rejects an advanced policy with no requirement selected", () => {
    const named = withDraftName(createEmptyDraft("persona_1"), "Signal Room");
    const advanced = withJoinPolicy(named, "advanced");
    expect(validateDraft(advanced, copy)).toEqual({
      valid: false,
      nameError: null,
      advancedError: "Select at least one requirement.",
    });
    expect(validateDraft(withAdvancedRequirements(advanced, [ageGate.requirement]), copy).valid).toBe(true);
  });

  test("distinguishes two configured requirements of the same kind", () => {
    const score8 = scoreGate.requirement;
    const score20: GateRequirement = { requirement: "reputation-score", provider: "passport", minimumScore: 20 };
    expect(requirementsEqual(score8, score20)).toBe(false);
    expect(hasRequirement([score8], score20)).toBe(false);
    expect(hasRequirement([score8, score20], score20)).toBe(true);

    const draft = withAdvancedRequirements(createEmptyDraft("persona_1"), [score8, score20]);
    expect(draftGatePolicy(draft).accessPaths[0].requirements).toEqual([score8, score20]);
  });

  test("leaving advanced clears the selected requirements", () => {
    const advanced = withAdvancedRequirements(createEmptyDraft("persona_1"), [ageGate.requirement]);
    expect(withJoinPolicy(advanced, "everyone").advancedRequirements).toEqual([]);
    expect(withJoinPolicy(advanced, "advanced").advancedRequirements).toEqual([ageGate.requirement]);
  });

  test("updates draft fields through the pure helpers", () => {
    const draft = createEmptyDraft("persona_1");
    expect(withDraftName(draft, "Signal Room").name).toBe("Signal Room");
    expect(withDraftDescription(draft, "").description).toBeNull();
    expect(withDraftDescription(draft, "A room").description).toBe("A room");
    expect(withDraftPersona(draft, "persona_2").personaId).toBe("persona_2");
  });
});
