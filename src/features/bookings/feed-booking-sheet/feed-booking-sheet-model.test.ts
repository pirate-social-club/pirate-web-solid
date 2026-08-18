import { describe, expect, test } from "bun:test";

import type { ResolvedSlot } from "../view-models";
import { firstAvailableSlot, formatFeedBookingPrice, getFeedBookingState } from "./feed-booking-sheet-model";

const slot = (available = true): ResolvedSlot => ({
  available,
  endUtc: "2026-09-21T09:30:00.000Z",
  priceCents: 3500,
  startUtc: "2026-09-21T09:00:00.000Z",
});

describe("feed booking sheet model", () => {
  test("keeps loading and error distinct from an empty response", () => {
    expect(getFeedBookingState([], { loading: true })).toBe("loading");
    expect(getFeedBookingState([], { error: true })).toBe("error");
    expect(getFeedBookingState([])).toBe("empty");
  });

  test("selects only available slots and formats the displayed starting price", () => {
    expect(firstAvailableSlot([slot(false), slot()])).toEqual(slot());
    expect(formatFeedBookingPrice(3500)).toBe("$35.00");
  });
});
