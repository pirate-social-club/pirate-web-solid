import { describe, expect, test } from "bun:test";

import { getLocaleMessages } from "../../../locales";
import {
  compileMembershipPolicy,
  createEmptyDraft,
  draftGatePolicy,
  gateKindsOf,
  hasRequirement,
  HUMAN_VERIFICATION,
  requirementsEqual,
  validateDraft,
  withAdditionalRequirements,
  withDraftDescription,
  withDraftName,
  withDraftPersona,
  type AdditionalGateOption,
  type AdditionalGateRequirement,
  type CreateCommunityCopy,
} from "./create-community-model";

// SAFETY: the generated routes catalog guarantees the createCommunity key shape for every UI locale.
const copy = getLocaleMessages("en", "routes").createCommunity as CreateCommunityCopy;

const scoreGate: AdditionalGateOption = {
  requirement: { requirement: "reputation-score", provider: "passport", minimumScore: 8 },
  label: "Passport score 8+",
  description: "Members must have a Passport reputation score of at least 8.",
};

describe("create community model", () => {
  test("wraps requirements in an AND policy", () => {
    expect(compileMembershipPolicy()).toEqual({
      version: 1,
      accessPaths: [{ id: "default", operator: "and", requirements: [{ requirement: "human-verification" }] }],
    });
  });

  test("derives ordered gate kinds from a compiled policy", () => {
    const policy = compileMembershipPolicy([scoreGate.requirement]);
    expect(gateKindsOf(policy)).toEqual(["human-verification", "reputation-score"]);
  });

  test("always prepends the unique-human membership baseline", () => {
    expect(compileMembershipPolicy().accessPaths[0].requirements).toEqual([HUMAN_VERIFICATION]);
    expect(compileMembershipPolicy([scoreGate.requirement]).accessPaths[0].requirements).toEqual([
      HUMAN_VERIFICATION,
      scoreGate.requirement,
    ]);
  });

  // The client never invents a threshold: the offered requirement is committed
  // exactly as the capability catalog supplied it.
  test("commits the offered requirement verbatim", () => {
    const offered: AdditionalGateRequirement = { requirement: "reputation-score", provider: "passport", minimumScore: 20 };
    const draft = withAdditionalRequirements(createEmptyDraft("persona_1"), [offered]);
    expect(draftGatePolicy(draft).accessPaths[0].requirements).toEqual([
      HUMAN_VERIFICATION,
      offered,
    ]);
  });

  test("defaults to Palm scan with no additional requirements", () => {
    const draft = createEmptyDraft("persona_1");
    expect(draft.name).toBe("");
    expect(draft.additionalRequirements).toEqual([]);
    expect(gateKindsOf(draftGatePolicy(draft))).toEqual(["human-verification"]);
  });

  test("validates a trimmed name", () => {
    const draft = createEmptyDraft("persona_1");
    expect(validateDraft(draft, copy)).toEqual({
      valid: false,
      nameError: "Name is required.",
    });
    expect(validateDraft({ ...draft, name: "   " }, copy).valid).toBe(false);
    expect(validateDraft({ ...draft, name: "  Signal Room  " }, copy)).toEqual({
      valid: true,
      nameError: null,
    });
  });

  test("distinguishes two configured requirements of the same kind", () => {
    const score8 = scoreGate.requirement;
    const score20: AdditionalGateRequirement = { requirement: "reputation-score", provider: "passport", minimumScore: 20 };
    expect(requirementsEqual(score8, score20)).toBe(false);
    expect(hasRequirement([score8], score20)).toBe(false);
    expect(hasRequirement([score8, score20], score20)).toBe(true);

    const draft = withAdditionalRequirements(createEmptyDraft("persona_1"), [score8, score20]);
    expect(draftGatePolicy(draft).accessPaths[0].requirements).toEqual([
      HUMAN_VERIFICATION,
      score8,
      score20,
    ]);
  });

  test("updates draft fields through the pure helpers", () => {
    const draft = createEmptyDraft("persona_1");
    expect(withDraftName(draft, "Signal Room").name).toBe("Signal Room");
    expect(withDraftDescription(draft, "").description).toBeNull();
    expect(withDraftDescription(draft, "A room").description).toBe("A room");
    expect(withDraftPersona(draft, "persona_2").personaId).toBe("persona_2");
  });
});
