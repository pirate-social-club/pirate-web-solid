import { describe, expect, test } from "bun:test";

import {
  compileGateWizardDraft,
  createDefaultGateWizardDraft,
  draftIncludesExplorationChecks,
  gateCheckCatalogEntry,
  incompleteGateCheckKinds,
  isGateCheckComplete,
  isGateCheckSelectable,
  parsePositiveAmount,
  replaceGateCheck,
  toggleGateCheck,
  visibleGateChecks,
  type GateWizardDraft,
} from "./community-gate-wizard-model";

describe("gate check catalog capabilities", () => {
  test("production mode omits exploration checks and freezes design-hold rows", () => {
    expect(visibleGateChecks("production").map((entry) => entry.kind)).toEqual([
      "age18",
      "nationality",
      "gender",
    ]);
    expect(isGateCheckSelectable(gateCheckCatalogEntry("age18")!, "production")).toBe(true);
    expect(isGateCheckSelectable(gateCheckCatalogEntry("nationality")!, "production")).toBe(false);
  });

  test("exploration mode exposes every catalog check as selectable", () => {
    expect(visibleGateChecks("exploration")).toHaveLength(6);
    for (const entry of visibleGateChecks("exploration")) {
      expect(isGateCheckSelectable(entry, "exploration")).toBe(true);
    }
  });
});

describe("gate wizard draft operations", () => {
  test("toggling adds configured defaults and keeps catalog order", () => {
    let draft = createDefaultGateWizardDraft();
    draft = toggleGateCheck(draft, "passport_score", "exploration");
    draft = toggleGateCheck(draft, "age18", "exploration");
    expect(draft.checks.map((check) => check.kind)).toEqual(["age18", "passport_score"]);
    expect(draft.checks[1]).toEqual({ kind: "passport_score", minimumScore: 20 });
  });

  test("toggling a selected check removes it", () => {
    let draft = toggleGateCheck(createDefaultGateWizardDraft(), "gender", "exploration");
    draft = toggleGateCheck(draft, "gender", "exploration");
    expect(draft.checks).toEqual([]);
  });

  test("production mode refuses to add design-hold and exploration checks", () => {
    expect(toggleGateCheck(createDefaultGateWizardDraft(), "nationality", "production").checks).toEqual([]);
    expect(toggleGateCheck(createDefaultGateWizardDraft(), "nft", "production").checks).toEqual([]);
  });
});

describe("gate check completeness", () => {
  test("nationality and gender require at least one selection", () => {
    expect(isGateCheckComplete({ kind: "nationality", allowedCountries: [] })).toBe(false);
    expect(isGateCheckComplete({ kind: "nationality", allowedCountries: ["JP"] })).toBe(true);
    expect(isGateCheckComplete({ kind: "gender", allowedMarkers: [] })).toBe(false);
    expect(isGateCheckComplete({ kind: "gender", allowedMarkers: ["F"] })).toBe(true);
  });

  test("nft collection checks require a mainnet contract and count range", () => {
    expect(
      isGateCheckComplete({
        kind: "nft",
        config: { mode: "collection", contractAddress: "0xnope", minCount: 1 },
      }),
    ).toBe(false);
    expect(
      isGateCheckComplete({
        kind: "nft",
        config: {
          mode: "collection",
          contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          minCount: 101,
        },
      }),
    ).toBe(false);
    expect(
      isGateCheckComplete({
        kind: "nft",
        config: {
          mode: "collection",
          contractAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          minCount: 1,
        },
      }),
    ).toBe(true);
  });

  test("collectible matches require a category, subject, and quantity", () => {
    expect(
      isGateCheckComplete({
        kind: "nft",
        config: { mode: "collectible", category: "trading-card", subject: "  ", minQuantity: 1 },
      }),
    ).toBe(false);
    expect(
      isGateCheckComplete({
        kind: "nft",
        config: { mode: "collectible", category: "watch", subject: "Submariner", minQuantity: 2 },
      }),
    ).toBe(true);
  });

  test("token balance requires a CAIP-19 asset id and positive amount", () => {
    const assetId = "eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    expect(isGateCheckComplete({ kind: "token_balance", assetId: "USDC", minAmount: "10" })).toBe(false);
    expect(isGateCheckComplete({ kind: "token_balance", assetId, minAmount: "0" })).toBe(false);
    expect(isGateCheckComplete({ kind: "token_balance", assetId, minAmount: "10.5" })).toBe(true);
    expect(parsePositiveAmount("0")).toBeNull();
    expect(parsePositiveAmount("12.75")).toBe(12.75);
  });

  test("passport score must be a whole number from 0 to 100", () => {
    expect(isGateCheckComplete({ kind: "passport_score", minimumScore: -1 })).toBe(false);
    expect(isGateCheckComplete({ kind: "passport_score", minimumScore: 20.5 })).toBe(false);
    expect(isGateCheckComplete({ kind: "passport_score", minimumScore: 100 })).toBe(true);
  });

  test("incomplete kinds gate the wizard draft", () => {
    let draft = toggleGateCheck(createDefaultGateWizardDraft(), "nationality", "exploration");
    expect(incompleteGateCheckKinds(draft)).toEqual(["nationality"]);
    draft = replaceGateCheck(draft, { kind: "nationality", allowedCountries: ["DE", "JP"] });
    expect(incompleteGateCheckKinds(draft)).toEqual([]);
  });
});

describe("compiled gate policy", () => {
  test("compiles one implicit-AND access path in a stable order", () => {
    let draft: GateWizardDraft = createDefaultGateWizardDraft();
    draft = toggleGateCheck(draft, "nationality", "exploration");
    draft = replaceGateCheck(draft, { kind: "nationality", allowedCountries: ["JP", "DE"] });
    draft = toggleGateCheck(draft, "age18", "exploration");
    expect(compileGateWizardDraft(draft)).toEqual({
      version: 1,
      accessPaths: [
        {
          id: "path-1",
          operator: "and",
          requirements: [
            { requirement: "human-verification" },
            { requirement: "age-minimum", minimumAge: 18 },
            { requirement: "nationality-allowed", allowedCountries: ["DE", "JP"] },
          ],
        },
      ],
    });
  });

  test("always compiles a human-verification baseline", () => {
    const draft: GateWizardDraft = createDefaultGateWizardDraft();
    const compiled = compileGateWizardDraft(draft);
    expect(compiled.accessPaths).toHaveLength(1);
    expect(compiled.accessPaths[0].requirements).toEqual([
      { requirement: "human-verification" },
    ]);
  });

  test("flags drafts that include exploration-only checks", () => {
    let draft = toggleGateCheck(createDefaultGateWizardDraft(), "age18", "exploration");
    expect(draftIncludesExplorationChecks(draft)).toBe(false);
    draft = toggleGateCheck(draft, "passport_score", "exploration");
    expect(draftIncludesExplorationChecks(draft)).toBe(true);
  });
});
