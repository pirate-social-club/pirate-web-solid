import { describe, expect, test } from "bun:test";

import {
  getBookingStateDisplay,
  getBookingStatusActions,
} from "./booking-status-card-model";
import type { BookingState } from "../view-models";

describe("booking status card actions", () => {
  test("exposes representative active actions", () => {
    expect(getBookingStatusActions("confirmed")).toEqual({ join: true, addToCalendar: true, cancel: true });
    expect(getBookingStatusActions("live")).toEqual({ join: true, addToCalendar: true, cancel: false });
    expect(getBookingStatusActions("completed")).toEqual({ join: false, addToCalendar: true, cancel: false });
    expect(getBookingStateDisplay("confirmed")).toMatchObject({ label: "Confirmed", tone: "success" });
  });

  test("does not offer actions for terminal states in the matrix", () => {
    const terminalStates: BookingState[] = [
      "settled",
      "expired_hold",
      "cancelled_before_payment",
      "cancelled_by_host",
      "cancelled_by_booker",
      "no_show_host",
      "no_show_booker",
      "refunded",
      "disputed",
    ];
    for (const state of terminalStates) {
      expect(getBookingStatusActions(state), state).toEqual({ join: false, addToCalendar: false, cancel: false });
    }
  });

  test("keeps payment and hold states informational while preserving state copy", () => {
    expect(getBookingStatusActions("hold")).toEqual({ join: false, addToCalendar: false, cancel: false });
    expect(getBookingStatusActions("quoted")).toEqual({ join: false, addToCalendar: false, cancel: true });
    expect(getBookingStatusActions("pending_payment")).toEqual({ join: false, addToCalendar: false, cancel: true });
    expect(getBookingStateDisplay("disputed")).toMatchObject({ label: "Under review", tone: "warning" });
  });
});
