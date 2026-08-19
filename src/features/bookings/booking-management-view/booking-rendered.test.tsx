/* oxlint-disable anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- JSX runtime and design-system mocks are intentionally structural test adapters. */

import { afterAll, describe, expect, mock, test } from "bun:test";
import { renderToString, ssrElement } from "@solidjs/web";
import { createComponent } from "solid-js";

const designSystemPath = new URL("../../../design-system.ts", import.meta.url).pathname;
const jsxRuntimePath = new URL("../../../../node_modules/@solidjs/web/types/jsx.d.ts", import.meta.url).pathname;

function element(tag: string, props: Record<string, unknown>) {
  const { children, class: className, ...rest } = props;
  return ssrElement(tag, { ...rest, ...(className ? { class: className } : {}) }, children, false);
}

const primitive = (tag: string) => (props: Record<string, unknown>) => element(tag, props);
mock.module(designSystemPath, () => ({
  Avatar: primitive("span"),
  Button: primitive("button"),
  Card: primitive("section"),
  CardContent: primitive("div"),
  FormFieldLabel: (props: Record<string, unknown>) => element("label", { for: props.htmlFor, children: props.label }),
  FormNote: primitive("p"),
  IconButton: primitive("button"),
  IconCalendar: primitive("svg"),
  IconPlus: primitive("svg"),
  IconWarningCircle: primitive("svg"),
  IconX: primitive("svg"),
  Input: primitive("input"),
  Separator: primitive("hr"),
  Skeleton: primitive("div"),
  Spinner: primitive("span"),
  Switch: (props: Record<string, unknown>) => element("input", { ...props, role: "switch", type: "checkbox" }),
  Type: (props: Record<string, unknown>) => element(String(props.as ?? "span"), props),
  buttonVariants: () => "button-variant",
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));

mock.module(jsxRuntimePath, () => ({
  Fragment: (props: { children?: unknown }) => props.children,
  jsx: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxs: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxDEV: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
}));

const { BookingManagementView } = await import("./booking-management-view");
const { BookingCheckout } = await import("../booking-checkout/booking-checkout");
const { BookingSessionControls } = await import("../booking-session-controls/booking-session-controls");
const { BookingsList } = await import("../bookings-list/bookings-list");
const { HostAvailabilityEditor } = await import("../host-availability-editor/host-availability-editor");
const { HostBookingPage } = await import("../host-booking-page/host-booking-page");
const { ProfileBookPanel } = await import("../profile-book-panel/profile-book-panel");

const quote = {
  allocation: { legs: [
    { recipientType: "host" as const, shareBps: 9000, amountCents: 4500, settlementStrategy: "operator_payout" as const },
    { recipientType: "platform_fee" as const, shareBps: 1000, amountCents: 500, settlementStrategy: "platform_fee_payout" as const },
  ] },
  expiresAtUtc: "2026-06-22T12:08:30Z", grossCents: 5000, hostPayoutCents: 4500, platformFeeCents: 500,
  slot: { available: true, endUtc: "2026-07-01T07:30:00Z", priceCents: 5000, startUtc: "2026-07-01T07:00:00Z" },
};

describe("B9 rendered branches and semantics", () => {
  test("renders management signed-out and role semantics", () => {
    const html = renderToString(() => createComponent(BookingManagementView, { role: "booker", state: "signed-out" }));
    expect(html).toContain("Sign in to view your bookings");
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Booking role"');
  });

  test("exposes loading as a status and keeps the error heading readable", () => {
    const loading = renderToString(() => createComponent(BookingManagementView, { role: "booker", state: "loading" }));
    const failure = renderToString(() => createComponent(BookingManagementView, { role: "booker", state: "error" }));

    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('aria-label="Loading bookings"');
    expect(failure).toContain("text-destructive-text");
    expect(failure).not.toContain('class="text-destructive"');
  });

  test("threads copy overrides through management and session labels", () => {
    const management = renderToString(() => createComponent(BookingManagementView, {
      copy: { roleLabel: "Booking perspective", signedOutTitle: "Custom sign-in", signIn: "Enter" },
      role: "booker", state: "signed-out",
    }));
    const session = renderToString(() => createComponent(BookingSessionControls, {
      copy: { leave: "Exit call", sessionWith: "Call with {name}" }, counterpartyName: "Amira Hassan",
      onLeave: () => undefined, state: "in-session", viewerRole: "booker",
    }));
    expect(management).toContain("Custom sign-in");
    expect(management).toContain('aria-label="Booking perspective"');
    expect(management).toContain(">Enter<");
    expect(session).toContain("Call with Amira Hassan");
    expect(session).toContain('aria-label="Exit call"');
  });

  test("renders checkout conflict, degraded attendance, and terminal controls", () => {
    const checkout = renderToString(() => createComponent(BookingCheckout, { nowUtc: "2026-06-22T12:00:00Z", holdExpiresAtUtc: "2026-06-22T12:08:30Z", phase: "conflict", quote, viewerTimezone: "Europe/Vienna" }));
    const session = renderToString(() => createComponent(BookingSessionControls, { attendanceHealth: "degraded", counterpartyName: "Amira Hassan", onLeave: () => undefined, state: "ready-to-settle", viewerRole: "host" }));
    expect(checkout).toContain("That slot was released");
    expect(session).toContain("Attendance reporting interrupted");
    expect(session).toContain("Finish");
    expect(session).toContain("Report");
  });

  test("keeps list selection buttons, editor minimums, and profile/host branches accessible", () => {
    const list = renderToString(() => createComponent(BookingsList, { items: [{ id: "b1", hostName: "Amira Hassan", hostPhotoSrc: null, startUtc: "2026-07-01T07:00:00Z", endUtc: "2026-07-01T07:30:00Z", state: "confirmed", priceCents: 5000 }], viewerTimezone: "Europe/Vienna" }));
    const editor = renderToString(() => createComponent(HostAvailabilityEditor, { exceptions: [], priceRules: [{ id: "price-1", matchWeekday: [1], startLocal: "09:00", endLocal: "17:00", priceCents: 5000 }], rules: [{ id: "rule-1", byWeekday: [1], startLocal: "09:00", endLocal: "17:00", slotDurationMinutes: 30 }] }));
    const host = renderToString(() => createComponent(HostBookingPage, { basePriceCents: 5000, bio: "A deterministic host.", name: "Amira Hassan", photoSrc: null, topics: [] }));
    const profile = renderToString(() => createComponent(ProfileBookPanel, { basePriceCents: 5000, configured: false, mode: "owner", onEdit: () => undefined, slots: [], viewerTimezone: "Europe/Vienna" }));
    const profileViewer = renderToString(() => createComponent(ProfileBookPanel, {
      mode: "viewer", onSelectSlot: () => undefined, slots: [{ available: true, endUtc: "2026-07-01T07:30:00Z", priceCents: 5000, startUtc: "2026-07-01T07:00:00Z" }],
      startingPriceCents: 5000, viewerTimezone: "Europe/Vienna",
    }));
    expect(list).toContain('aria-label="Amira Hassan, Confirmed"');
    expect(editor).toContain('aria-label="Mon availability"');
    expect(editor).toContain('min="5"');
    expect(editor).toContain('min="1"');
    expect(host).toContain("Book");
    expect(profile).toContain("Schedule");
    expect(profileViewer).toContain('data-profile-book-panel="viewer"');
    expect(profileViewer).toContain("09:00 AM");
    expect(profileViewer).not.toContain("Schedule");
  });
});

afterAll(() => mock.restore());
