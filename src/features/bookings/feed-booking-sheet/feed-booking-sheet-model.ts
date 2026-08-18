import type { ResolvedSlot } from "../view-models";

export type FeedBookingState = "error" | "loading" | "empty" | "ready";

export function getFeedBookingState(
  slots: ReadonlyArray<ResolvedSlot>,
  options: { error?: boolean; loading?: boolean } = {},
): FeedBookingState {
  if (options.error) return "error";
  if (options.loading) return "loading";
  if (slots.length === 0 || !slots.some((slot) => slot.available)) return "empty";
  return "ready";
}

export function firstAvailableSlot(slots: ReadonlyArray<ResolvedSlot>): ResolvedSlot | undefined {
  return slots.find((slot) => slot.available);
}

export function formatFeedBookingPrice(priceCents: number): string {
  return `$${(priceCents / 100).toFixed(2)}`;
}
