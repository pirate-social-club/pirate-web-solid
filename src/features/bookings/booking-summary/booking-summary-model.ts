import {
  formatBookingDate,
  formatCentsAsUsdc,
  formatSlotDuration,
  formatSlotTime,
  formatTzLabel,
} from "../booking-format";
import type { BookingQuotePreview, IanaTz } from "../view-models";

export interface BookingSummaryAmounts {
  gross: string;
  platformFee: string;
  hostPayout: string;
}

export function getBookingSummaryAmounts(quote: BookingQuotePreview): BookingSummaryAmounts {
  return {
    gross: formatCentsAsUsdc(quote.grossCents),
    hostPayout: formatCentsAsUsdc(quote.hostPayoutCents),
    platformFee: formatCentsAsUsdc(quote.platformFeeCents),
  };
}

export interface BookingSummarySession {
  date: string;
  time: string;
  duration: string;
  timezone: string;
}

export function getBookingSummarySession(quote: BookingQuotePreview, viewerTz: IanaTz): BookingSummarySession {
  return {
    date: formatBookingDate(quote.slot.startUtc, viewerTz),
    duration: formatSlotDuration(quote.slot.startUtc, quote.slot.endUtc),
    time: formatSlotTime(quote.slot.startUtc, viewerTz),
    timezone: formatTzLabel(viewerTz),
  };
}
