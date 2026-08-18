/* oxlint-disable anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- JSX runtime and design-system mocks are intentionally structural test adapters. */

import { describe, expect, mock, test } from "bun:test";
import { renderToString, ssrElement } from "@solidjs/web";
import { createComponent } from "solid-js";

import {
  defaultAvailabilityDayKey,
  findSelectedAvailabilitySlot,
  getAvailabilityFooterModel,
  groupSlotsByDay,
  isAvailabilityInteractive,
} from "./availability-calendar-model";
import { getSlotUniformity } from "../booking-format";
import type { ResolvedSlot } from "../view-models";

const designSystemPath = new URL("../../../design-system.ts", import.meta.url).pathname;
const jsxRuntimePath = new URL("../../../../node_modules/@solidjs/web/types/jsx.d.ts", import.meta.url).pathname;

function element(tag: string, props: Record<string, unknown>) {
  const { children, class: className, ...rest } = props;
  return ssrElement(tag, { ...rest, ...(className ? { class: className } : {}) }, children, false);
}

// Keep the component boundary real while avoiding the design-system barrel's browser-only exports in Bun SSR.
mock.module(designSystemPath, () => ({
  Avatar: (props: Record<string, unknown>) => element("span", props),
  Button: (props: Record<string, unknown>) => element("button", props),
  Card: (props: Record<string, unknown>) => element("div", props),
  CardContent: (props: Record<string, unknown>) => element("div", props),
  IconButton: (props: Record<string, unknown>) => element("button", props),
  IconCalendar: (props: Record<string, unknown>) => element("svg", props),
  IconPlus: (props: Record<string, unknown>) => element("svg", props),
  IconWarningCircle: (props: Record<string, unknown>) => element("svg", props),
  IconX: (props: Record<string, unknown>) => element("svg", props),
  Input: (props: Record<string, unknown>) => element("input", props),
  Separator: (props: Record<string, unknown>) => element("hr", props),
  Skeleton: (props: Record<string, unknown>) => element("div", props),
  Spinner: (props: Record<string, unknown>) => element("span", props),
  Type: (props: Record<string, unknown>) => element(String(props.as ?? "span"), props),
  buttonVariants: () => "button-variant",
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));

// The root Bun command otherwise applies the React tsconfig to this Solid TSX file. Forward JSX to Solid's
// actual SSR primitives so renderToString receives markup rather than an incompatible/empty element tree.
mock.module(jsxRuntimePath, () => ({
  Fragment: (props: { children?: unknown }) => props.children,
  jsx: (type: unknown, props: Record<string, unknown>) =>
    typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxs: (type: unknown, props: Record<string, unknown>) =>
    typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxDEV: (type: unknown, props: Record<string, unknown>) =>
    typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
}));

const { AvailabilityCalendar } = await import("./availability-calendar");

const slot = (startUtc: string, endUtc: string, priceCents = 5000, available = true): ResolvedSlot => ({
  available,
  endUtc,
  priceCents,
  startUtc,
});

const UNIFORM: ResolvedSlot[] = [
  slot("2026-09-21T09:00:00Z", "2026-09-21T09:30:00Z"),
  slot("2026-09-21T10:00:00Z", "2026-09-21T10:30:00Z"),
  slot("2026-09-22T14:00:00Z", "2026-09-22T14:30:00Z"),
];

const MIXED: ResolvedSlot[] = [
  slot("2026-09-21T09:00:00Z", "2026-09-21T09:30:00Z", 3500),
  slot("2026-09-21T10:00:00Z", "2026-09-21T11:00:00Z", 7500),
];

function renderCalendar(
  slots: ResolvedSlot[],
  props: Partial<Parameters<typeof AvailabilityCalendar>[0]> = {},
): string {
  return renderToString(() => createComponent(AvailabilityCalendar, {
    slots,
    viewerTimezone: "Europe/Vienna",
    ...props,
  }));
}

describe("availability calendar view model", () => {
  test("selects only an available slot and derives the confirmation footer", () => {
    const unavailable = slot("2026-09-21T09:00:00Z", "2026-09-21T09:30:00Z", 5000, false);
    const selected = slot("2026-09-21T10:00:00Z", "2026-09-21T10:30:00Z");

    expect(findSelectedAvailabilitySlot([unavailable, selected], unavailable.startUtc)).toBeUndefined();
    expect(findSelectedAvailabilitySlot([unavailable, selected], selected.startUtc)).toEqual(selected);
    expect(getAvailabilityFooterModel(selected, "Europe/Vienna")).toMatchObject({
      date: "Mon, Sep 21",
      duration: "30 min",
      price: "$50",
    });
  });

  test("shows price captions for mixed pricing and keeps read-only mode non-interactive", () => {
    const slots = [
      slot("2026-09-21T09:00:00Z", "2026-09-21T09:30:00Z", 3500),
      slot("2026-09-21T10:00:00Z", "2026-09-21T11:00:00Z", 7500),
    ];
    expect(getSlotUniformity(slots)).toEqual({ sameDuration: false, samePrice: false });
    expect(isAvailabilityInteractive()).toBe(false);
    expect(isAvailabilityInteractive(() => undefined)).toBe(true);
    expect(isAvailabilityInteractive(undefined, () => "/checkout")).toBe(true);
  });

  test("marks repeated DST fallback wall-clock times for disambiguation", () => {
    const groups = groupSlotsByDay([
      slot("2026-10-25T00:30:00Z", "2026-10-25T01:00:00Z"),
      slot("2026-10-25T01:30:00Z", "2026-10-25T02:00:00Z"),
    ], "Europe/Vienna");

    expect(groups).toHaveLength(1);
    expect(groups[0]?.ambiguousTimes).toEqual(new Set(["02:30 AM"]));
    expect(defaultAvailabilityDayKey(groups)).toBe(groups[0]?.dateKey);
  });
});

describe("AvailabilityCalendar rendered branches", () => {
  test("renders the empty-window fallback instead of the day picker", () => {
    const html = renderCalendar([]);

    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("<div");
    expect(html).toContain("No open slots in this window.");
    expect(html).not.toContain("data-booking-day-strip");
  });

  test("renders the no-open-times fallback for a day with only unavailable slots", () => {
    const html = renderCalendar([
      slot("2026-09-21T09:00:00Z", "2026-09-21T09:30:00Z", 5000, false),
    ]);

    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("data-booking-day-strip");
    expect(html).toContain("No open times this day.");
    expect(html).not.toContain("data-booking-confirm-footer");
  });

  test("omits uniform duration and price captions but renders mixed captions", () => {
    const uniformHtml = renderCalendar(UNIFORM, { onSelectSlot: () => undefined });
    const mixedHtml = renderCalendar(MIXED, { onSelectSlot: () => undefined });

    expect(uniformHtml.length).toBeGreaterThan(0);
    expect(uniformHtml).toContain("data-booking-day-strip");
    expect(mixedHtml.length).toBeGreaterThan(0);
    expect(mixedHtml).toContain("data-booking-day-strip");
    expect(uniformHtml).not.toContain("$50");
    expect(uniformHtml).not.toContain("30 min");
    expect(mixedHtml).toContain("$35");
    expect(mixedHtml).toContain("$75");
    expect(mixedHtml).toContain("30 min");
    expect(mixedHtml).toContain("1 hr");
  });

  test("renders read-only slots as non-button content", () => {
    const html = renderCalendar(UNIFORM);

    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("data-booking-day-strip");
    expect(html).toContain("11:00 AM");
    // The only buttons are the two day pills; slot chips are inert divs.
    expect(html.match(/<button\b/gu)).toHaveLength(2);
  });

  test("renders callback-only continuation as a button", () => {
    const html = renderCalendar(UNIFORM, {
      onSelectSlot: () => undefined,
      selectedStartUtc: UNIFORM[0]?.startUtc,
    });

    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("data-booking-confirm-footer");
    expect(html).toMatch(/<button[^>]*>Continue<\/button>/u);
    expect(html).not.toMatch(/<a[^>]*>Continue<\/a>/u);
  });

  test("renders href continuation as an anchor", () => {
    const html = renderCalendar(UNIFORM, {
      getSlotHref: () => "/checkout",
      selectedStartUtc: UNIFORM[0]?.startUtc,
    });

    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain('href="/checkout"');
    expect(html).toMatch(/<a[^>]*>Continue<\/a>/u);
    expect(html).not.toMatch(/<button[^>]*>Continue<\/button>/u);
  });
});
