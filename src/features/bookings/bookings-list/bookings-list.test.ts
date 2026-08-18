import { describe, expect, test } from "bun:test";

import { groupSlotsByDay } from "../availability-calendar/availability-calendar-model";
import { bookingStateGroup, bookingStateLabel } from "./bookings-list-model";

describe("bookings list model", () => {
  test("keeps booking labels stable for payment and attendance outcomes", () => {
    expect(bookingStateLabel("pending_payment")).toBe("Payment verifying");
    expect(bookingStateLabel("no_show_host")).toBe("Host no-show");
    expect(bookingStateLabel("disputed")).toBe("Under review");
  });

  test("groups terminal cancellation and settlement states", () => {
    expect(bookingStateGroup("confirmed")).toBe("upcoming");
    expect(bookingStateGroup("settled")).toBe("past");
    expect(bookingStateGroup("cancelled_by_host")).toBe("cancelled");
  });

  test("keeps both repeated DST-fallback wall-clock times discoverable", () => {
    const groups = groupSlotsByDay([
      { startUtc: "2026-11-01T05:30:00Z", endUtc: "2026-11-01T06:00:00Z", priceCents: 5000, available: true },
      { startUtc: "2026-11-01T06:30:00Z", endUtc: "2026-11-01T07:00:00Z", priceCents: 5000, available: true },
    ], "America/New_York");
    expect(groups[0]?.ambiguousTimes.has("01:30 AM")).toBe(true);
  });
});
