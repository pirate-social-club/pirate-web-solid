import { describe, expect, test } from "bun:test";

import { groupBookingManagementItems, managementToneClass, type BookingManagementItem } from "./booking-management-view-model";

const item = (section: BookingManagementItem["section"], id = section): BookingManagementItem => ({
  id, counterpartyName: "Amira Hassan", counterpartyHandle: "amira.pirate", sessionTimeLabel: "6 PM", amountLabel: "50.00 USDC", statusLabel: "Confirmed", statusDetail: "Booked", statusTone: "success", section,
});

describe("booking management view model", () => {
  test("keeps section order and drops empty sections", () => {
    expect(groupBookingManagementItems([item("past"), item("upcoming", "upcoming-2"), item("past", "past-2")]).map((group) => group.section)).toEqual(["upcoming", "past"]);
    expect(groupBookingManagementItems([item("past")])[0]?.items).toHaveLength(1);
  });

  test("maps outcome tones to semantic tokens", () => {
    expect(managementToneClass("success")).toBe("text-success");
    expect(managementToneClass("warning")).toBe("text-warning");
    expect(managementToneClass("muted")).toBe("text-muted-foreground");
  });
});
