import type { BookingState } from "../view-models";

export function bookingStateLabel(state: BookingState): string {
  switch (state) {
    case "hold": return "Slot held";
    case "quoted": return "Quote ready";
    case "pending_payment": return "Payment verifying";
    case "confirmed": return "Confirmed";
    case "live": return "In progress";
    case "completed": return "Completed";
    case "settled": return "Settled";
    case "expired_hold": return "Hold expired";
    case "cancelled_before_payment": return "Cancelled";
    case "cancelled_by_host": return "Cancelled by host";
    case "cancelled_by_booker": return "Cancelled";
    case "no_show_host": return "Host no-show";
    case "no_show_booker": return "No-show";
    case "refunded": return "Refunded";
    case "disputed": return "Under review";
  }
}

export function bookingStateGroup(state: BookingState): "upcoming" | "past" | "cancelled" {
  if (state === "cancelled_before_payment" || state === "cancelled_by_host" || state === "cancelled_by_booker") return "cancelled";
  if (["completed", "settled", "no_show_host", "no_show_booker", "refunded", "disputed"].includes(state)) return "past";
  return "upcoming";
}
