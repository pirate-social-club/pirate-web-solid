import { formatCentsAsUsdc } from "../booking-format";
import type {
  AvailabilityExceptionDraft,
  AvailabilityRuleDraft,
  PriceRuleDraft,
} from "../host-availability-editor/host-availability-editor-model";

export const PROFILE_BOOKING_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface ProfileBookingsValues {
  timezone: string;
  durationSeconds: number;
  priceUsd: string;
}

export interface ProfileBookingsSectionState {
  values: ProfileBookingsValues;
  rules: AvailabilityRuleDraft[];
  priceRules: PriceRuleDraft[];
  exceptions: AvailabilityExceptionDraft[];
  bookable: boolean;
  payoutReady: boolean;
  busy: boolean;
}

export function formatProfilePrice(priceUsd: string): string {
  const amount = Number(priceUsd);
  if (!Number.isFinite(amount) || amount < 0) return "—";
  return formatCentsAsUsdc(Math.round(amount * 100));
}

export function formatUsdCents(cents: number): string {
  return `$${(Math.max(0, Math.round(cents)) / 100).toFixed(2)}`;
}

export function formatProfileDuration(durationSeconds: number, durationTemplate: string): string {
  const minutes = Math.max(0, Math.round(durationSeconds / 60));
  return durationTemplate.replace("{count}", String(minutes));
}

export function formatRuleSummary(
  rule: Pick<AvailabilityRuleDraft, "byWeekday" | "startLocal" | "endLocal">,
): string {
  const days = rule.byWeekday.map((day) => PROFILE_BOOKING_WEEKDAYS[day] ?? "?").join(", ");
  return `${days} · ${rule.startLocal}–${rule.endLocal}`;
}

export function formatPriceRuleSummary(
  rule: Pick<PriceRuleDraft, "matchWeekday" | "startLocal" | "endLocal" | "priceCents">,
  allDaysLabel = "All days",
): string {
  const days = rule.matchWeekday.map((day) => PROFILE_BOOKING_WEEKDAYS[day] ?? "?").join(", ");
  return `${days || allDaysLabel} · ${rule.startLocal}–${rule.endLocal} · ${formatUsdCents(rule.priceCents)}`;
}

export function formatExceptionSummary(
  exception: Pick<AvailabilityExceptionDraft, "kind" | "startUtc" | "endUtc">,
  locale = "en",
  labels: { block?: string; open?: string } = {},
): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const kind = exception.kind === "block" ? labels.block ?? "Block" : labels.open ?? "Open";
  return `${kind} · ${formatter.format(new Date(exception.startUtc))}–${formatter.format(new Date(exception.endUtc))} UTC`;
}

export function canToggleBookable(state: Pick<ProfileBookingsSectionState, "payoutReady" | "busy">): boolean {
  return state.payoutReady && !state.busy;
}

export function toggleBookable(state: ProfileBookingsSectionState): ProfileBookingsSectionState {
  return canToggleBookable(state) ? { ...state, bookable: !state.bookable } : state;
}

export function updateProfileValues(
  values: ProfileBookingsValues,
  patch: Partial<ProfileBookingsValues>,
): ProfileBookingsValues {
  return { ...values, ...patch };
}

export function profileBookingsStateLabel(
  state: Pick<ProfileBookingsSectionState, "bookable" | "payoutReady" | "rules">,
): "not-configured" | "wallet-blocked" | "published-with-availability" | "published-without-availability" | "draft" {
  if (!state.payoutReady) return "wallet-blocked";
  if (state.bookable && state.rules.length > 0) return "published-with-availability";
  if (state.bookable) return "published-without-availability";
  if (state.rules.length === 0) return "not-configured";
  return "draft";
}

export type { AvailabilityExceptionDraft, AvailabilityRuleDraft, PriceRuleDraft };
