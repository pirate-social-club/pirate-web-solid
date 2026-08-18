export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface AvailabilityRuleDraft {
  id: string;
  byWeekday: number[];
  startLocal: string;
  endLocal: string;
  slotDurationMinutes: number;
}

export interface PriceRuleDraft {
  id: string;
  matchWeekday: number[];
  startLocal: string;
  endLocal: string;
  priceCents: number;
}

export interface AvailabilityExceptionDraft {
  id: string;
  kind: "block" | "open";
  startUtc: string;
  endUtc: string;
}

export function toggleDay(days: readonly number[], day: number): number[] {
  return days.includes(day) ? days.filter((value) => value !== day) : [...days, day].sort((a, b) => a - b);
}

export function localUtcInput(utc: string): string {
  return utc.replace(/\.000Z$|Z$/, "").slice(0, 16);
}

export function utcFromLocalInput(value: string): string {
  return value ? `${value}:00Z` : value;
}

export function clampSlotDurationMinutes(value: number): number {
  return Math.max(5, Number.isFinite(value) ? Math.floor(value) : 5);
}

export function clampPriceCents(value: number): number {
  return Math.max(1, Number.isFinite(value) ? Math.floor(value) : 1);
}

export function nextDraftId(prefix: string, existingIds: readonly string[]): string {
  let index = 1;
  while (existingIds.includes(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}
