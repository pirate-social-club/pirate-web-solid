import {
  formatBookingDate,
  formatCentsAsUsd,
  formatDayPillDay,
  formatDayPillWeekday,
  formatSlotDuration,
  formatSlotTime,
} from "../booking-format";
import type { IanaTz, IsoInstant, ResolvedSlot } from "../view-models";

export interface AvailabilityDayGroup {
  dateKey: string;
  label: string;
  weekdayShort: string;
  dayOfMonth: string;
  slots: ResolvedSlot[];
  ambiguousTimes: Set<string>;
}

/** Group slots in viewer-local days and mark repeated wall-clock times (DST fallback). */
export function groupSlotsByDay(slots: ResolvedSlot[], viewerTz: IanaTz): AvailabilityDayGroup[] {
  const groups = new Map<string, AvailabilityDayGroup>();
  for (const slot of slots) {
    const dateKey = new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "short",
      timeZone: viewerTz,
      weekday: "short",
    }).format(new Date(slot.startUtc));
    if (!groups.has(dateKey)) {
      groups.set(dateKey, {
        ambiguousTimes: new Set(),
        dateKey,
        dayOfMonth: formatDayPillDay(slot.startUtc, viewerTz),
        label: dateKey,
        slots: [],
        weekdayShort: formatDayPillWeekday(slot.startUtc, viewerTz),
      });
    }
    groups.get(dateKey)!.slots.push(slot);
  }

  for (const group of groups.values()) {
    const seen = new Map<string, number>();
    for (const slot of group.slots) {
      const timeLabel = formatSlotTime(slot.startUtc, viewerTz);
      seen.set(timeLabel, (seen.get(timeLabel) ?? 0) + 1);
    }
    for (const [timeLabel, count] of seen) {
      if (count > 1) group.ambiguousTimes.add(timeLabel);
    }
  }
  return [...groups.values()];
}

export function defaultAvailabilityDayKey(dayGroups: AvailabilityDayGroup[]): string | null {
  return dayGroups.find((day) => day.slots.some((slot) => slot.available))?.dateKey
    ?? dayGroups[0]?.dateKey
    ?? null;
}

export function findSelectedAvailabilitySlot(
  slots: ResolvedSlot[],
  selectedStartUtc: IsoInstant | undefined,
): ResolvedSlot | undefined {
  return selectedStartUtc
    ? slots.find((slot) => slot.startUtc === selectedStartUtc && slot.available)
    : undefined;
}

export interface AvailabilityFooterModel {
  date: string;
  time: string;
  duration: string;
  price: string;
}

export function getAvailabilityFooterModel(slot: ResolvedSlot, viewerTz: IanaTz): AvailabilityFooterModel {
  return {
    date: formatBookingDate(slot.startUtc, viewerTz),
    duration: formatSlotDuration(slot.startUtc, slot.endUtc),
    price: formatCentsAsUsd(slot.priceCents),
    time: formatSlotTime(slot.startUtc, viewerTz),
  };
}

export function isAvailabilityInteractive(
  onSelectSlot?: (slot: ResolvedSlot, event?: MouseEvent) => void,
  getSlotHref?: (slot: ResolvedSlot) => string,
): boolean {
  return Boolean(onSelectSlot || getSlotHref);
}
