/* oxlint-disable anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- JSX runtime and design-system mocks are intentionally structural test adapters. */

import { describe, expect, mock, test } from "bun:test";
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
  Button: primitive("button"),
  Card: primitive("section"),
  CardContent: primitive("div"),
  FormFieldLabel: (props: Record<string, unknown>) => element("label", { for: props.htmlFor, children: props.label }),
  FormNote: (props: Record<string, unknown>) => element("p", props),
  Input: primitive("input"),
  Switch: (props: Record<string, unknown>) => element("input", { ...props, role: "switch", type: "checkbox" }),
  Type: (props: Record<string, unknown>) => element(String(props.as ?? "span"), props),
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));

mock.module(jsxRuntimePath, () => ({
  Fragment: (props: { children?: unknown }) => props.children,
  jsx: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxs: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxDEV: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
}));

const { ProfileBookingsSection } = await import("./profile-bookings-section");

const baseProps = {
  values: { timezone: "Europe/Vienna", durationSeconds: 1800, priceUsd: "50.00" },
  rules: [{ id: "bar_1", byWeekday: [1, 2, 3, 4, 5], startLocal: "09:00", endLocal: "17:00", slotDurationMinutes: 30 }],
  priceRules: [{ id: "bprl_1", matchWeekday: [6], startLocal: "10:00", endLocal: "13:00", priceCents: 7500 }],
  exceptions: [{ id: "bae_1", kind: "block" as const, startUtc: new Date(1790000000 * 1000).toISOString(), endUtc: new Date(1790086400 * 1000).toISOString() }],
  bookable: true,
  payoutReady: true,
  timezoneOptions: ["UTC", "Europe/Vienna"],
};

describe("ProfileBookingsSection SSR", () => {
  test("renders all localized sections, formatted booking facts, and no network surface", () => {
    const html = renderToString(() => createComponent(ProfileBookingsSection, baseProps));
    expect(html).toContain("Paid 1:1 bookings");
    expect(html).toContain("Weekly availability");
    expect(html).toContain("Variable pricing");
    expect(html).toContain("One-off exceptions");
    expect(html).toContain("Cancellation policy");
    expect(html).toContain("$75.00");
    expect(html).toContain("Mon, Tue, Wed, Thu, Fri");
    expect(html).toContain("Bookable");
    expect(html).toContain('data-profile-settings-section="bookings"');
    expect(html).not.toContain("fetch(");
    expect(html).not.toContain("http://");
  });

  test("renders the no-wallet gate and published-without-availability warning", () => {
    const html = renderToString(() => createComponent(ProfileBookingsSection, {
      ...baseProps,
      bookable: true,
      payoutReady: false,
      rules: [],
      priceRules: [],
      exceptions: [],
    }));
    expect(html).toContain("Set up your app wallet to receive payouts.");
    expect(html).toContain("Bookable is on, but you're not visible yet");
    expect(html).toContain('data-profile-bookings-state="wallet-blocked"');
  });
});
