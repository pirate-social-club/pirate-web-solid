export type IanaTz = string;
export type IsoInstant = string;

export type BookingState =
  | "hold"
  | "quoted"
  | "pending_payment"
  | "confirmed"
  | "live"
  | "completed"
  | "settled"
  | "expired_hold"
  | "cancelled_before_payment"
  | "cancelled_by_host"
  | "cancelled_by_booker"
  | "no_show_host"
  | "no_show_booker"
  | "refunded"
  | "disputed";

interface BookingAllocation {
  legs: Array<{
    recipientType: "host" | "platform_fee";
    shareBps: number;
    amountCents: number;
    settlementStrategy: "operator_payout" | "platform_fee_payout";
  }>;
}

export interface BookingQuotePreview {
  slot: ResolvedSlot;
  grossCents: number;
  platformFeeCents: number;
  hostPayoutCents: number;
  allocation: BookingAllocation;
  expiresAtUtc: IsoInstant;
}

export interface BookingCancellationPreview {
  object: "booking_cancellation_preview";
  bookingId: string;
  cancelledBy: "host" | "booker";
  grossCents: number;
  refundCents: number;
  hostPayoutCents: number;
  platformFeeCents: number;
  previewedAt: IsoInstant;
  policyCutoffAt: IsoInstant | null;
}

export interface ResolvedSlot {
  startUtc: IsoInstant;
  endUtc: IsoInstant;
  priceCents: number;
  available: boolean;
}
