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

const { RoyaltyClaimModal } = await import("./royalty-claim-modal");

describe("royalty claim modal rendered and SSR states", () => {
  const base = {
    onOpenChange: () => undefined,
    open: true,
    totalClaimableWipWei: "12450000000000000000",
    walletAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  } as const;

  test("renders the ready state and accessible claim controls", () => {
    const html = renderToString(() => createComponent(RoyaltyClaimModal, { ...base, claimState: { status: "ready" } }));
    expect(html).toContain("Claim royalties");
    expect(html).toContain("12.45 WIP");
    expect(html).toContain('aria-label="Receive claimed royalties as IP"');
    expect(html).toContain(">Claim</button>");
  });

  test("renders no-wallet, pending, success, and error semantics", () => {
    const noWallet = renderToString(() => createComponent(RoyaltyClaimModal, { ...base, claimState: { status: "no-wallet" }, walletAddress: null }));
    const preparing = renderToString(() => createComponent(RoyaltyClaimModal, { ...base, claimState: { status: "preparing" } }));
    const signing = renderToString(() => createComponent(RoyaltyClaimModal, { ...base, claimState: { status: "signing" } }));
    const submitting = renderToString(() => createComponent(RoyaltyClaimModal, { ...base, claimState: { status: "submitting" } }));
    const success = renderToString(() => createComponent(RoyaltyClaimModal, { ...base, claimState: { status: "success", txHash: "0x1234567890abcdef" } }));
    const error = renderToString(() => createComponent(RoyaltyClaimModal, { ...base, claimState: { message: "User rejected the transaction request.", status: "error" } }));
    expect(noWallet).toContain("No wallet connected");
    expect(noWallet).toContain("Connect wallet");
    expect(preparing).toContain("Preparing claim");
    expect(signing).toContain('aria-busy="true"');
    expect(signing).toContain("Confirm in wallet");
    expect(submitting).toContain("Submitting claim");
    expect(success).toContain('role="status"');
    expect(success).toContain("Royalties claimed: 0x12345678...");
    expect(error).toContain('role="alert"');
    expect(error).toContain("User rejected the transaction request.");
  });
});

afterAll(() => mock.restore());
