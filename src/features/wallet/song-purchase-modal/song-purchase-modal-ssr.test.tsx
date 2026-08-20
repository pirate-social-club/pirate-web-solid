/* oxlint-disable anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- JSX runtime and design-system mocks are intentionally structural test adapters. */

import { afterAll, describe, expect, mock, test } from "bun:test";
import { renderToString, ssrElement } from "@solidjs/web";
import { createComponent } from "solid-js";

const designSystemPath = new URL("../../../design-system.ts", import.meta.url).pathname;
const jsxRuntimePath = new URL("../../../../node_modules/@solidjs/web/types/jsx.d.ts", import.meta.url).pathname;

function primitive(tag: string) {
  return (props: Record<string, unknown>) => {
    const { children, class: className, ...rest } = props;
    return ssrElement(tag, { ...rest, ...(className ? { class: className } : {}) }, children, false);
  };
}

const typePrimitive = (props: Record<string, unknown>) => {
  const { as = "span", children, class: className, ...rest } = props;
  return ssrElement(String(as), { ...rest, ...(className ? { class: className } : {}) }, children, false);
};

const jsxRuntime = () => ({
  Fragment: (props: { children?: unknown }) => props.children,
  jsx: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxs: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxDEV: (type: unknown, props: Record<string, unknown>) => typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
});

mock.module(designSystemPath, () => ({
  Button: primitive("button"),
  Dialog: (props: Record<string, unknown>) => props.children,
  DialogContent: primitive("section"),
  DialogDescription: typePrimitive,
  DialogFooter: primitive("footer"),
  DialogHeader: primitive("header"),
  DialogTitle: typePrimitive,
  FormNote: primitive("p"),
  Switch: primitive("input"),
  Type: typePrimitive,
  cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
}));
mock.module(jsxRuntimePath, jsxRuntime);
mock.module("@solidjs/web/jsx-runtime", jsxRuntime);
mock.module("@solidjs/web/jsx-dev-runtime", jsxRuntime);

const { SongPurchaseModal } = await import("./song-purchase-modal");

describe("song purchase modal rendered and SSR states", () => {
  const base = {
    onOpenChange: () => undefined,
    open: true,
    priceLabel: "$3.99",
    songTitle: "Midnight Waves",
  } as const;

  test("renders purchase summary and callback-only primary action", () => {
    const html = renderToString(() => createComponent(SongPurchaseModal, { ...base, state: "desktop" }));
    expect(html).toContain("Midnight Waves");
    expect(html).toContain("Get a downloadable copy of this song.");
    expect(html).toContain("Buy for $3.99");
    expect(html).not.toContain("USDC");
    expect(html).toContain("Save up to 20% with Self.xyz");
  });

  test("renders verified, vinyl, processing, and error states with accessible status", () => {
    const verified = renderToString(() => createComponent(SongPurchaseModal, { ...base, priceLabel: "$3.19", state: "verified" }));
    const vinyl = renderToString(() => createComponent(SongPurchaseModal, { ...base, state: "vinyl-available" }));
    const processing = renderToString(() => createComponent(SongPurchaseModal, { ...base, state: "processing" }));
    const error = renderToString(() => createComponent(SongPurchaseModal, { ...base, state: "error" }));
    expect(verified).toContain("Self.xyz discount");
    expect(verified).toContain("20% off");
    expect(vinyl).toContain("Vinyl available after unlock.");
    expect(processing).toContain('aria-busy="true"');
    expect(processing).toContain("Processing purchase");
    expect(error).toContain('role="alert"');
    expect(error).toContain("Checkout transaction was rejected.");
  });
});

afterAll(() => mock.restore());
