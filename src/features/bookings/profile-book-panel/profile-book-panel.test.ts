import { describe, expect, test } from "bun:test";

import { profileBookEmptyLabel, sessionFactsLine } from "./profile-book-panel-model";

const slots = [{ startUtc: "2026-09-21T09:00:00.000Z", endUtc: "2026-09-21T09:30:00.000Z", priceCents: 5000, available: true }];

describe("profile book panel model", () => {
  test("renders timezone-aware duration, price, and empty-state labels", () => {
    expect(sessionFactsLine(slots, "Europe/Vienna", 5000)).toBe("30 min · $50 · Times in Vienna");
    expect(profileBookEmptyLabel("owner")).toContain("schedule");
    expect(profileBookEmptyLabel("viewer")).toContain("slots");
  });

  test("suppresses a shared duration when resolved slots have mixed lengths", () => {
    const mixed = [
      ...slots,
      { startUtc: "2026-09-21T10:00:00.000Z", endUtc: "2026-09-21T11:00:00.000Z", priceCents: 5000, available: true },
    ];
    expect(sessionFactsLine(mixed, "Europe/Vienna", 5000)).toBe("$50 · Times in Vienna");
  });
});
