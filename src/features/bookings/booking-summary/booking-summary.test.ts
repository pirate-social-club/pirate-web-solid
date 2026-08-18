import { describe, expect, test } from "bun:test";

import { getBookingSummaryAmounts, getBookingSummarySession } from "./booking-summary-model";
import type { BookingQuotePreview } from "../view-models";

const quote = (grossCents: number): BookingQuotePreview => {
  const platformFeeCents = Math.floor(grossCents / 10);
  return {
    allocation: {
      legs: [
        { recipientType: "host", shareBps: 9000, amountCents: grossCents - platformFeeCents, settlementStrategy: "operator_payout" },
        { recipientType: "platform_fee", shareBps: 1000, amountCents: platformFeeCents, settlementStrategy: "platform_fee_payout" },
      ],
    },
    expiresAtUtc: "2026-07-01T06:50:00Z",
    grossCents,
    hostPayoutCents: grossCents - platformFeeCents,
    platformFeeCents,
    slot: {
      available: true,
      endUtc: "2026-07-01T07:30:00Z",
      priceCents: grossCents,
      startUtc: "2026-07-01T07:00:00Z",
    },
  };
};

describe("booking summary view model", () => {
  test("formats variable and odd-cent amounts without losing precision", () => {
    expect(getBookingSummaryAmounts(quote(6000))).toEqual({
      gross: "60.00 USDC",
      hostPayout: "54.00 USDC",
      platformFee: "6.00 USDC",
    });
    expect(getBookingSummaryAmounts(quote(3333))).toEqual({
      gross: "33.33 USDC",
      hostPayout: "30.00 USDC",
      platformFee: "3.33 USDC",
    });
  });

  test("formats the same instant in the viewer's alternate timezone", () => {
    expect(getBookingSummarySession(quote(5000), "America/New_York")).toEqual({
      date: "Wed, Jul 1",
      duration: "30 min",
      time: "03:00 AM",
      timezone: "New York",
    });
  });
});
