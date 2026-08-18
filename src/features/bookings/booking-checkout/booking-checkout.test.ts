import { describe, expect, test } from "bun:test";

import { formatHoldCountdown, secondsUntilHoldExpires } from "./booking-checkout-model";

describe("booking checkout model", () => {
  test("keeps the hold countdown deterministic and clamps expired holds", () => {
    expect(secondsUntilHoldExpires("2026-06-22T12:08:30Z", "2026-06-22T12:00:00Z")).toBe(510);
    expect(formatHoldCountdown(510)).toBe("8:30");
    expect(formatHoldCountdown(secondsUntilHoldExpires("2026-06-22T12:00:45Z", "2026-06-22T12:01:00Z"))).toBe("0:00");
  });

  test("rejects invalid timestamps without exposing a NaN label", () => {
    expect(secondsUntilHoldExpires("not-a-date", "2026-06-22T12:00:00Z")).toBe(0);
    expect(formatHoldCountdown(-5)).toBe("0:00");
  });
});
