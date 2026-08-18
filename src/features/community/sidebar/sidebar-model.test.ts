import { describe, expect, test } from "bun:test";

import {
  emptyGateCopy,
  formatCommunityCount,
  gateModeLabel,
  orderedGates,
  orderedSidebarReferenceLinks,
  orderedSidebarRules,
  safeSidebarHref,
} from "./sidebar-model";

describe("community sidebar model", () => {
  test("keeps unmet gates first while preserving deterministic status ordering", () => {
    expect(orderedGates([
      { label: "Passport", status: "met", type: "wallet_score" },
      { label: "Palm", status: "unmet", type: "unique_human" },
      { label: "Nationality", status: "unknown", type: "nationality" },
    ]).map((gate) => gate.label)).toEqual(["Palm", "Nationality", "Passport"]);
  });

  test("describes AND, OR, unknown, and action-time PoW entry surfaces", () => {
    expect(gateModeLabel("all", 2)).toBe("All 2 requirements");
    expect(gateModeLabel("any", 3)).toBe("Any 3 requirements");
    expect(gateModeLabel("unknown", 1)).toBe("Requirements pending match mode");
    expect(gateModeLabel("any", 2, true)).toBe("Any 2 requirements or browser check at join time");
    expect(gateModeLabel("all", 0, true)).toBe("Browser check at join time");
    expect(gateModeLabel("all", 0)).toBe("No durable requirements");
    expect(orderedGates([
      { label: "Palm", status: "unmet", type: "human" },
      { label: "Score", status: "met", type: "wallet" },
    ]).map((gate) => gate.label)).toEqual(["Palm", "Score"]);
  });

  test("only action-time checks claim browser verification for empty gates", () => {
    expect(emptyGateCopy(true)).toBe("A browser check runs when you join.");
    expect(emptyGateCopy(false)).toBe("No durable requirements are configured.");
  });

  test("formats counts for both English and Arabic locales", () => {
    expect(formatCommunityCount(1234567)).toBe("1,234,567");
    expect(formatCommunityCount(1234567, "ar")).toContain("١");
  });

  test("orders rules and reference links and rejects unsafe hrefs", () => {
    expect(orderedSidebarRules([
      { body: "Second", position: 2, title: "Two" },
      { body: "First", position: 1, title: "One" },
    ]).map((rule) => rule.title)).toEqual(["One", "Two"]);
    expect(orderedSidebarReferenceLinks([
      { href: "https://example.com/two", label: "Two", position: 2 },
      { href: "https://example.com/one", label: "One", position: 1 },
    ]).map((link) => link.label)).toEqual(["One", "Two"]);
    expect(safeSidebarHref("javascript:alert(1)")).toBeNull();
    expect(safeSidebarHref("//evil.example")).toBeNull();
    expect(safeSidebarHref("/c/example")).toBe("/c/example");
    expect(safeSidebarHref("https://example.com")).toBe("https://example.com");
  });
});
