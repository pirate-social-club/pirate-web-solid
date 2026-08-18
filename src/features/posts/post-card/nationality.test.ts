import { describe, expect, test } from "bun:test";

import { buildNationalityBadgeLabel, nationalityMatchesQualifier } from "./nationality";

describe("post card nationality badge helpers", () => {
  test("matches abbreviated nationality qualifiers", () => {
    expect(nationalityMatchesQualifier({
      countryCode: "US",
      qualifierLabels: ["18+", "US National"],
      locale: "en",
    })).toBe(true);
  });

  test("matches country-name nationality qualifiers", () => {
    expect(nationalityMatchesQualifier({
      countryCode: "US",
      qualifierLabels: ["United States nationality"],
      locale: "en",
    })).toBe(true);
  });

  test("does not match unrelated qualifiers", () => {
    expect(nationalityMatchesQualifier({
      countryCode: "AR",
      qualifierLabels: ["18+", "Unique Human"],
      locale: "en",
    })).toBe(false);
  });

  test("builds accessible badge labels", () => {
    expect(buildNationalityBadgeLabel("AR", "en")).toBe("Verified Argentina nationality");
  });
});

