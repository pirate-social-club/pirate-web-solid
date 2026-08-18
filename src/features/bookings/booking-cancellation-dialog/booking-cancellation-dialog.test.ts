import { describe, expect, test } from "bun:test";

import {
  cancellationRequiresAcknowledgement,
  defaultBookingCancellationDialogCopy,
  fillBookingCancellationCopy,
  getBookingCancellationErrorMessage,
  getBookingCancellationRefundMessage,
  isCancellationConfirmDisabled,
} from "./booking-cancellation-dialog-model";
import type { BookingCancellationPreview } from "../view-models";

const preview = (refundCents: number, cancelledBy: "booker" | "host" = "booker"): BookingCancellationPreview => ({
  object: "booking_cancellation_preview",
  bookingId: "booking_test",
  cancelledBy,
  grossCents: 5000,
  refundCents,
  hostPayoutCents: refundCents === 0 ? 4500 : 0,
  platformFeeCents: refundCents === 0 ? 500 : 0,
  previewedAt: "2026-07-10T10:00:00.000Z",
  policyCutoffAt: "2026-07-11T14:00:00.000Z",
});

describe("booking cancellation dialog state", () => {
  test("provides a stable accessible title and interpolated session name", () => {
    expect(defaultBookingCancellationDialogCopy.title).toBe("Cancel booking?");
    expect(fillBookingCancellationCopy(defaultBookingCancellationDialogCopy.sessionWith, {
      name: "Amira Hassan",
      time: "Monday, July 13 at 6:00 PM",
    })).toBe("Monday, July 13 at 6:00 PM with Amira Hassan");
  });

  test("gates a no-refund booker cancellation until acknowledgement", () => {
    const noRefund = preview(0);
    expect(cancellationRequiresAcknowledgement(noRefund)).toBe(true);
    expect(isCancellationConfirmDisabled("ready", noRefund, false)).toBe(true);
    expect(isCancellationConfirmDisabled("ready", noRefund, true)).toBe(false);
    expect(cancellationRequiresAcknowledgement(preview(5000))).toBe(false);
    expect(cancellationRequiresAcknowledgement(preview(0, "host"))).toBe(false);
  });

  test("keeps submitting disabled and surfaces explicit or generic errors", () => {
    expect(isCancellationConfirmDisabled("submitting", preview(5000), true)).toBe(true);
    expect(getBookingCancellationErrorMessage("error", "Refund terms changed.")).toBe("Refund terms changed.");
    expect(getBookingCancellationErrorMessage("error", undefined)).toBe(
      "The booking could not be cancelled. Try again.",
    );
    expect(getBookingCancellationErrorMessage("ready", "ignored")).toBeUndefined();
    expect(getBookingCancellationRefundMessage(preview(5000), "Amira Hassan")).toBe("You receive 50.00 USDC back.");
    expect(getBookingCancellationRefundMessage(preview(5000, "host"), "Amira Hassan")).toBe("Amira Hassan receives a full refund.");
  });
});
