/* oxlint-disable anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- Solid SSR test adapters intentionally mirror the renderer boundary. */

import { describe, expect, mock, test } from "bun:test";
import { renderToString, ssrElement } from "@solidjs/web";
import { createComponent } from "solid-js";

import { formatUnreadCount, normalizeUnreadCount, resolveShellTitle, shellNavItems } from "./shell-model";

const designSystemPath = new URL("../../design-system.ts", import.meta.url).pathname;
const jsxRuntimePath = new URL("../../../node_modules/@solidjs/web/types/jsx.d.ts", import.meta.url).pathname;

function element(tag: string, props: Record<string, unknown>) {
  const { children, class: className, ...rest } = props;
  return ssrElement(tag, { ...rest, ...(className ? { class: className } : {}) }, children, false);
}

mock.module(designSystemPath, () => {
  const icon = (props: Record<string, unknown>) => element("svg", props);
  return {
    Avatar: (props: Record<string, unknown>) => element("span", props),
    IconArrowLeft: icon,
    IconBell: icon,
    IconButton: (props: Record<string, unknown>) => element("button", props),
    IconChatCircle: icon,
    IconHouse: icon,
    IconList: icon,
    IconPlus: icon,
    IconSquare: icon,
    IconWallet: icon,
    IconX: icon,
    Type: (props: Record<string, unknown>) => element(String(props.as ?? "span"), props),
    cn: (...values: unknown[]) => values.filter(Boolean).join(" "),
  };
});

mock.module(jsxRuntimePath, () => ({
  Fragment: (props: { children?: unknown }) => props.children,
  jsx: (type: unknown, props: Record<string, unknown>) =>
    typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxs: (type: unknown, props: Record<string, unknown>) =>
    typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
  jsxDEV: (type: unknown, props: Record<string, unknown>) =>
    typeof type === "string" ? ssrElement(type, props, props.children, false) : createComponent(type as never, props),
}));

const { MobileFooterNav } = await import("./app-shell-chrome/app-shell-chrome");

describe("shell model", () => {
  test("normalizes unread counts for accessible labels and badges", () => {
    expect(normalizeUnreadCount(undefined)).toBe(0);
    expect(normalizeUnreadCount(Number.NaN)).toBe(0);
    expect(normalizeUnreadCount(-4.8)).toBe(0);
    expect(normalizeUnreadCount(12.9)).toBe(12);
    expect(formatUnreadCount(120)).toBe("99+");
  });

  test("keeps the mobile navigation order stable", () => {
    expect(shellNavItems).toEqual(["home", "wallet", "chat", "inbox", "profile"]);
  });

  test("resolves deterministic story route titles", () => {
    expect(resolveShellTitle("home")).toBe("Pirate");
    expect(resolveShellTitle("profile")).toBe("story.pirate");
  });

  test("renders an accessible footer with real icon SVGs and unread labels", () => {
    const html = renderToString(() => createComponent(MobileFooterNav, {
      forceMobile: true,
      labels: {
        chat: "Chat",
        home: "Home",
        inbox: "Inbox",
        profile: "Profile",
        wallet: "Wallet",
        primaryNavAriaLabel: "Primary navigation",
      },
      unreadInboxCount: 12,
    }));

    expect(html).toContain('aria-label="Primary navigation"');
    expect(html).toContain('aria-label="Inbox, 12"');
    expect(html).toContain("<svg");
  });
});
