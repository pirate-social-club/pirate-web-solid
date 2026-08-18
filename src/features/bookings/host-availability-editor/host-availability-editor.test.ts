import { describe, expect, test } from "bun:test";

import { clampPriceCents, clampSlotDurationMinutes, localUtcInput, nextDraftId, toggleDay, utcFromLocalInput } from "./host-availability-editor-model";

describe("host availability editor model", () => {
  test("toggles weekdays in stable order and generates collision-free ids", () => {
    expect(toggleDay([1, 3], 2)).toEqual([1, 2, 3]);
    expect(toggleDay([1, 3], 1)).toEqual([3]);
    expect(nextDraftId("rule", ["rule-1", "rule-2", "rule-4"])).toBe("rule-3");
  });

  test("round-trips UTC datetime inputs without losing the explicit UTC marker", () => {
    expect(localUtcInput("2026-07-04T00:00:00Z")).toBe("2026-07-04T00:00");
    expect(utcFromLocalInput("2026-07-04T12:30")).toBe("2026-07-04T12:30:00Z");
  });

  test("clamps numeric edits to useful non-zero booking values", () => {
    expect(clampSlotDurationMinutes(0)).toBe(5);
    expect(clampSlotDurationMinutes(Number.NaN)).toBe(5);
    expect(clampPriceCents(0)).toBe(1);
  });
});
