/* oxlint-disable anti-slop/no-conditional-empty-object-spread, anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- JSX runtime and design-system mocks are structural SSR adapters. */

import { describe, expect, mock, test } from "bun:test";
import { renderToString, ssrElement } from "@solidjs/web";
import { createComponent } from "solid-js";

const designSystemPath = new URL("../../../design-system.ts", import.meta.url).pathname;
const availabilityCalendarPath = new URL("../availability-calendar/availability-calendar", import.meta.url).pathname;
const jsxRuntimePath = new URL("../../../../node_modules/@solidjs/web/types/jsx.d.ts", import.meta.url).pathname;

function element(tag: string, props: Record<string, unknown>) {
  const { children, class: className, ...rest } = props;
  const attributes = { ...rest };
  if (className) attributes.class = className;
  return ssrElement(tag, attributes, children, false);
}

const primitive = (tag: string) => (props: Record<string, unknown>) => element(tag, props);
mock.module(designSystemPath, () => ({
  Button: primitive("button"),
  Card: primitive("section"),
  Type: (props: Record<string, unknown>) => element(String(props.as ?? "span"), props),
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));
mock.module(availabilityCalendarPath, () => ({
  AvailabilityCalendar: (props: Record<string, unknown>) => element("div", {
    "data-availability-count": (props.slots as unknown[]).length,
    children: "09:00 AM",
  }),
}));
mock.module(jsxRuntimePath, () => ({
  Fragment: (props: { children?: unknown }) => props.children,
  jsx: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxs: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxDEV: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
}));

const { ProfileBookPanel } = await import("./profile-book-panel");

const slot = { available: true, endUtc: "2026-09-21T09:30:00.000Z", priceCents: 5000, startUtc: "2026-09-21T09:00:00.000Z" };

describe("ProfileBookPanel rendered semantics", () => {
  test("keeps the viewer branch available in SSR", () => {
    const html = renderToString(() => createComponent(ProfileBookPanel, {
      mode: "viewer",
      onSelectSlot: () => undefined,
      slots: [slot],
      startingPriceCents: 5000,
      viewerTimezone: "Europe/Vienna",
    }));
    expect(html).toContain('data-profile-book-panel="viewer"');
    expect(html).toContain("09:00 AM");
    expect(html).not.toContain("Set up bookings");
  });

  test("keeps the owner empty state accessible in SSR", () => {
    const html = renderToString(() => createComponent(ProfileBookPanel, {
      basePriceCents: 5000,
      configured: false,
      mode: "owner",
      onEdit: () => undefined,
      slots: [],
      viewerTimezone: "Europe/Vienna",
    }));
    expect(html).toContain("Set up bookings");
    expect(html).not.toContain('data-profile-book-panel="viewer"');
  });
});
