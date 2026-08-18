import type { IanaTz, IsoInstant } from "./view-models";

export function formatCentsAsUsd(cents: number): string {
  return new Intl.NumberFormat("en", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    style: "currency",
  }).format(cents / 100);
}

export function formatCentsAsUsdc(cents: number): string {
  return `${(cents / 100).toFixed(2)} USDC`;
}

export function formatSlotTime(startUtc: IsoInstant, viewerTz: IanaTz): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: viewerTz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(startUtc));
}

export function formatBookingDate(startUtc: IsoInstant, viewerTz: IanaTz): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    timeZone: viewerTz,
    weekday: "short",
  }).format(new Date(startUtc));
}

export function formatDayPillWeekday(startUtc: IsoInstant, viewerTz: IanaTz): string {
  return new Intl.DateTimeFormat("en", {
    timeZone: viewerTz,
    weekday: "short",
  }).format(new Date(startUtc));
}

export function formatDayPillDay(startUtc: IsoInstant, viewerTz: IanaTz): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    timeZone: viewerTz,
  }).format(new Date(startUtc));
}

export function formatTzAbbrev(startUtc: IsoInstant, viewerTz: IanaTz): string {
  return (
    new Intl.DateTimeFormat("en", {
      timeZone: viewerTz,
      timeZoneName: "short",
    })
      .formatToParts(new Date(startUtc))
      .find((part) => part.type === "timeZoneName")?.value ?? viewerTz
  );
}

export function formatTzLabel(viewerTz: IanaTz): string {
  return viewerTz.split("/").at(-1)?.replaceAll("_", " ") ?? viewerTz;
}

export function formatSlotDuration(startUtc: IsoInstant, endUtc: IsoInstant): string {
  const minutes = Math.round((Date.parse(endUtc) - Date.parse(startUtc)) / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

export interface SlotUniformity {
  sameDuration: boolean;
  samePrice: boolean;
}

export function getSlotUniformity(
  slots: ReadonlyArray<{ startUtc: IsoInstant; endUtc: IsoInstant; priceCents: number }>,
): SlotUniformity {
  const first = slots[0];
  if (!first) return { sameDuration: true, samePrice: true };
  const duration = Date.parse(first.endUtc) - Date.parse(first.startUtc);
  return {
    sameDuration: slots.every(
      (slot) => Date.parse(slot.endUtc) - Date.parse(slot.startUtc) === duration,
    ),
    samePrice: slots.every((slot) => slot.priceCents === first.priceCents),
  };
}
