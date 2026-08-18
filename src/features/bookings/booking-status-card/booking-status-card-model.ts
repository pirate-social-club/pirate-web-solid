import type { BookingState } from "../view-models";

export interface BookingStateDisplay {
  label: string;
  description: string;
  tone: "default" | "warning" | "success" | "muted";
}

export function getBookingStateDisplay(state: BookingState): BookingStateDisplay {
  switch (state) {
    case "hold": return { description: "Complete your payment to confirm.", label: "Slot held", tone: "warning" };
    case "quoted": return { description: "Review and pay to reserve your slot.", label: "Quote ready", tone: "default" };
    case "pending_payment": return { description: "Waiting for on-chain confirmation.", label: "Payment verifying", tone: "warning" };
    case "confirmed": return { description: "Your session is booked.", label: "Confirmed", tone: "success" };
    case "live": return { description: "Session is live.", label: "In progress", tone: "success" };
    case "completed": return { description: "Session finished.", label: "Completed", tone: "muted" };
    case "settled": return { description: "Host payout complete.", label: "Settled", tone: "muted" };
    case "expired_hold": return { description: "The slot was released.", label: "Hold expired", tone: "muted" };
    case "cancelled_before_payment": return { description: "Cancelled before payment — no charge.", label: "Cancelled", tone: "muted" };
    case "cancelled_by_host": return { description: "Full refund issued.", label: "Cancelled by host", tone: "muted" };
    case "cancelled_by_booker": return { description: "Refund per cancellation policy.", label: "Cancelled", tone: "muted" };
    case "no_show_host": return { description: "Full refund issued.", label: "Host no-show", tone: "warning" };
    case "no_show_booker": return { description: "No refund per policy.", label: "No-show", tone: "warning" };
    case "refunded": return { description: "Refund complete.", label: "Refunded", tone: "muted" };
    case "disputed": return { description: "Dispute open — awaiting resolution.", label: "Under review", tone: "warning" };
  }
}

export interface BookingStatusActions {
  join: boolean;
  addToCalendar: boolean;
  cancel: boolean;
}

export function getBookingStatusActions(state: BookingState): BookingStatusActions {
  return {
    addToCalendar: state === "confirmed" || state === "live" || state === "completed",
    cancel: state === "confirmed" || state === "pending_payment" || state === "quoted",
    join: state === "confirmed" || state === "live",
  };
}
