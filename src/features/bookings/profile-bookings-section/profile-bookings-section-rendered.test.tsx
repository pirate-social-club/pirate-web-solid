/* oxlint-disable anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- JSX runtime and design-system mocks are intentionally structural test adapters. */

import { describe, expect, mock, test } from "bun:test";
import { renderToString, ssrElement } from "@solidjs/web";
import { createComponent } from "solid-js";

const designSystemPath = new URL("../../../design-system.ts", import.meta.url).pathname;
const uiLocalePath = new URL("../../../lib/ui-locale.tsx", import.meta.url).pathname;
const jsxRuntimePath = new URL("../../../../node_modules/@solidjs/web/types/jsx.d.ts", import.meta.url).pathname;
let activeLocale = "en";

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

mock.module(uiLocalePath, () => ({
  useUiLocale: () => activeLocale,
}));

mock.module(jsxRuntimePath, () => ({
  Fragment: (props: { children?: unknown }) => props.children,
  jsx: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxs: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxDEV: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
}));

const { ProfileBookingsSection } = await import("./profile-bookings-section");

const props = {
  values: { timezone: "Europe/Vienna", durationSeconds: 1800, priceUsd: "50.00" },
  rules: [],
  priceRules: [],
  exceptions: [],
  bookable: false,
  payoutReady: false,
  timezoneOptions: ["UTC", "Europe/Vienna"],
};

describe("ProfileBookingsSection rendered semantics", () => {
  test("exposes native keyboard targets, associated fields, and a payout-disabled switch", () => {
    const html = renderToString(() => createComponent(ProfileBookingsSection, props));
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-label="Bookable"');
    expect(html).toContain("disabled role=\"switch\"");
    expect(html).toContain('for="profile-bookings-timezone"');
    expect(html).toContain('for="profile-bookings-duration"');
    expect(html).toContain('for="profile-bookings-price"');
    expect(html).toContain('aria-label="Weekly availability"');
    expect(html).toContain('aria-label="Variable pricing"');
    expect(html).toContain('aria-label="One-off exceptions: start"');
    expect(html).toContain('aria-label="One-off exceptions: end"');
    expect(html).toStartWith("<div");
    expect(html).not.toContain("Remove");
  });

  test("busy state is announced and adders are disabled without mutating callback-owned data", () => {
    const html = renderToString(() => createComponent(ProfileBookingsSection, {
      ...props,
      busy: true,
      payoutReady: true,
    }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-profile-bookings-state="not-configured"');
    expect(html).toContain('data-profile-bookings-adder="weekly" disabled');
    expect(html).not.toContain("Saving…");
  });

  test("toggling gates only the bookable switch, while saving announces without disabling controls", () => {
    const toggling = renderToString(() => createComponent(ProfileBookingsSection, {
      ...props,
      payoutReady: true,
      toggling: true,
    }));
    expect(toggling).toContain('aria-label="Bookable" disabled role="switch"');
    expect(toggling).toContain('data-profile-bookings-adder="weekly" type="button"');
    expect(toggling).not.toContain('data-profile-bookings-adder="weekly" disabled');

    const saving = renderToString(() => createComponent(ProfileBookingsSection, {
      ...props,
      payoutReady: true,
      saving: true,
    }));
    expect(saving).toContain("Saving…");
    expect(saving).not.toContain('aria-label="Bookable" disabled role="switch"');
    expect(saving).not.toContain('data-profile-bookings-adder="weekly" disabled');
  });

  test("keeps Arabic copy and logical RTL layout through the locale accessor", () => {
    activeLocale = "ar";
    try {
      const html = renderToString(() => ssrElement(
        "div",
        { dir: "rtl" },
        createComponent(ProfileBookingsSection, { ...props, payoutReady: true }),
        false,
      ));
      expect(html).toContain('dir="rtl"');
      expect(html).toContain("حجوزات 1:1 مدفوعة");
      expect(html).toContain('aria-label="المنطقة الزمنية"');
      expect(html).toContain("إلى");
      expect(html).not.toContain("Paid 1:1 bookings");
    } finally {
      activeLocale = "en";
    }
  });
});
