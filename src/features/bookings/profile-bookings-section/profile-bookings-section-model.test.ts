import { describe, expect, test } from "bun:test";

import {
  canToggleBookable,
  formatExceptionSummary,
  formatPriceRuleSummary,
  formatProfileDuration,
  formatProfilePrice,
  formatRuleSummary,
  profileBookingsStateLabel,
  toggleBookable,
  updateProfileValues,
} from "./profile-bookings-section-model";

describe("profile bookings section model", () => {
  test("formats base money, duration, weekly rules, variable pricing, and exceptions", () => {
    expect(formatProfilePrice("50.00")).toBe("50.00 USDC");
    expect(formatProfilePrice("invalid")).toBe("—");
    expect(formatProfileDuration(1800, "{count} minutes")).toBe("30 minutes");
    expect(formatRuleSummary({ byWeekday: [1, 2, 3, 4, 5], startLocal: "09:00", endLocal: "17:00" })).toBe("Mon, Tue, Wed, Thu, Fri · 09:00–17:00");
    expect(formatPriceRuleSummary({ matchWeekday: [6], startLocal: "10:00", endLocal: "13:00", priceCents: 7500 })).toBe("Sat · 10:00–13:00 · $75.00");
    expect(formatExceptionSummary({ kind: "block", startUtc: "2026-09-21T00:00:00Z", endUtc: "2026-09-22T00:00:00Z" })).toContain("Block ·");
  });

  test("allows only payout-ready, non-busy bookable transitions", () => {
    expect(canToggleBookable({ payoutReady: false, busy: false })).toBe(false);
    expect(canToggleBookable({ payoutReady: true, busy: true })).toBe(false);
    expect(canToggleBookable({ payoutReady: true, busy: false })).toBe(true);
    const state = {
      values: { timezone: "Europe/Vienna", durationSeconds: 1800, priceUsd: "50.00" },
      rules: [], priceRules: [], exceptions: [], bookable: false, payoutReady: true, busy: false,
    } as const;
    expect(toggleBookable(state).bookable).toBe(true);
    expect(toggleBookable({ ...state, payoutReady: false }).bookable).toBe(false);
  });

  test("keeps callback-owned values immutable and reports the five story states", () => {
    const values = { timezone: "Europe/Vienna", durationSeconds: 1800, priceUsd: "50.00" };
    expect(updateProfileValues(values, { priceUsd: "75.00" })).toEqual({ ...values, priceUsd: "75.00" });
    expect(values.priceUsd).toBe("50.00");
    expect(profileBookingsStateLabel({ payoutReady: true, bookable: false, rules: [] })).toBe("not-configured");
    expect(profileBookingsStateLabel({ payoutReady: false, bookable: false, rules: [] })).toBe("wallet-blocked");
    expect(profileBookingsStateLabel({ payoutReady: true, bookable: true, rules: [{ id: "r", byWeekday: [1], startLocal: "09:00", endLocal: "17:00", slotDurationMinutes: 30 }] })).toBe("published-with-availability");
    expect(profileBookingsStateLabel({ payoutReady: true, bookable: true, rules: [] })).toBe("published-without-availability");
    expect(profileBookingsStateLabel({ payoutReady: true, bookable: false, rules: [{ id: "r", byWeekday: [1], startLocal: "09:00", endLocal: "17:00", slotDurationMinutes: 30 }] })).toBe("draft");
  });
});
