import { describe, expect, test } from "bun:test";

import {
  GATE_CATALOG,
  compileGatePolicy,
  compileGateRequirement,
  createEmptyDraft,
  gateKindsOf,
  validateDraft,
  withDraftDescription,
  withDraftGates,
  withDraftName,
} from "./create-community-model";

describe("create community model", () => {
  test("compiles provider-neutral gate requirements into an AND policy", () => {
    expect(compileGateRequirement("human-verification")).toEqual({ requirement: "human-verification" });
    expect(compileGateRequirement("age-minimum")).toEqual({ requirement: "age-minimum", minimumAge: 18 });
    expect(compileGatePolicy([compileGateRequirement("human-verification")])).toEqual({
      version: 1,
      accessPaths: [{ id: "default", operator: "and", requirements: [{ requirement: "human-verification" }] }],
    });
  });

  test("derives ordered gate kinds from a compiled policy", () => {
    const policy = compileGatePolicy([
      compileGateRequirement("human-verification"),
      compileGateRequirement("age-minimum"),
    ]);
    expect(gateKindsOf(policy)).toEqual(["human-verification", "age-minimum"]);
    expect(gateKindsOf(compileGatePolicy([]))).toEqual([]);
  });

  test("validates a trimmed name and starts with palm verification", () => {
    const draft = createEmptyDraft("persona_1");
    expect(draft.name).toBe("");
    expect(gateKindsOf(draft.policy)).toEqual(["human-verification"]);
    expect(validateDraft(draft)).toEqual({ valid: false, nameError: "Name is required." });
    expect(validateDraft({ name: "   " })).toEqual({ valid: false, nameError: "Name is required." });
    expect(validateDraft({ name: "  Signal Room  " })).toEqual({ valid: true, nameError: null });
  });

  test("updates draft fields through the pure helpers", () => {
    const draft = withDraftGates(createEmptyDraft("persona_1"), ["human-verification"]);
    expect(gateKindsOf(draft.policy)).toEqual(["human-verification"]);
    expect(withDraftName(draft, "Signal Room").name).toBe("Signal Room");
    expect(withDraftDescription(draft, "").description).toBeNull();
    expect(withDraftDescription(draft, "A room").description).toBe("A room");
  });

  test("exposes a neutral gate catalog", () => {
    expect(GATE_CATALOG.map((entry) => entry.kind)).toEqual([
      "human-verification",
      "age-minimum",
      "reputation-score",
    ]);
  });
});
