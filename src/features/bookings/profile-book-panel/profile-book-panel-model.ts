import { formatCentsAsUsd, formatSlotDuration, formatTzLabel, getSlotUniformity } from "../booking-format";
import type { IanaTz, ResolvedSlot } from "../view-models";

export function sessionFactsLine(slots: readonly ResolvedSlot[], viewerTimezone: IanaTz, fallbackPriceCents: number): string {
  const uniformity = getSlotUniformity(slots);
  const duration = uniformity.sameDuration && slots[0]
    ? formatSlotDuration(slots[0].startUtc, slots[0].endUtc)
    : "";
  const price = uniformity.samePrice && slots[0]
    ? formatCentsAsUsd(slots[0].priceCents)
    : fallbackPriceCents > 0 ? `from ${formatCentsAsUsd(fallbackPriceCents)}` : "";
  return [duration, price, `Times in ${formatTzLabel(viewerTimezone)}`].filter(Boolean).join(" · ");
}

export function profileBookEmptyLabel(mode: "owner" | "viewer"): string {
  return mode === "owner" ? "No booking schedule is configured yet." : "No open slots in this window.";
}
