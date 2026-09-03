/** @jsxImportSource @solidjs/web */
import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PrivySessionExchange } from "../../api/privy-session.ts";
import { GlobalSignInHost, GLOBAL_SIGN_IN_EVENT } from "./global-sign-in-host.tsx";

const disposers: Array<() => void> = [];

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot((rootDispose) => {
    dispose = rootDispose;
    solidRender(ui, container);
  });
  disposers.push(() => {
    dispose();
    container.remove();
  });
  return container;
}

/** Lets the microtask queue drain so awaited attempts settle. */
async function settle(): Promise<void> {
  await new Promise((resolve) => { setTimeout(resolve, 0); });
}

function fakeExchange(): PrivySessionExchange {
  return {
    beginOAuth: vi.fn(async () => "https://privy.example.test/authorize"),
    clear: vi.fn(async () => undefined),
    completeOAuth: vi.fn(async () => undefined),
    loginWithCode: vi.fn(async () => undefined),
    loginWithWallet: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    sendCode: vi.fn(async () => undefined),
  };
}

/**
 * jsdom refuses real navigation; replacing the whole location object for the
 * duration of the check lets a reload be observed (or proven absent) and
 * restored afterwards.
 */
async function withStubbedLocation(reload: () => void, body: () => Promise<void>): Promise<void> {
  const original = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...original, origin: original.origin, href: original.href, reload },
    writable: true,
  });
  try {
    await body();
  } finally {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: original,
      writable: true,
    });
  }
}

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
  document.body.replaceChildren();
});

describe("global sign-in host", () => {
  test("refreshes the shared store after authentication instead of reloading the document", async () => {
    const refresh = vi.fn();
    const reload = vi.fn();
    const exchange = fakeExchange();
    // SAFETY: jsdom defines no injected provider, so this optional property is
    // absent outside this test and is restored in the finally block below.
    const originalEthereum = (window as Window & { ethereum?: unknown }).ethereum;
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request: vi.fn() },
    });
    const container = render(() => (
      <GlobalSignInHost createExchange={async () => exchange} refresh={refresh} />
    ));

    try {
      await withStubbedLocation(reload, async () => {
        window.dispatchEvent(new CustomEvent(GLOBAL_SIGN_IN_EVENT));
        await settle();

        const dialog = document.querySelector("[role='dialog']");
        expect(dialog).not.toBeNull();

        const walletButton = Array.from(container.ownerDocument.querySelectorAll("button"))
          .find(button => button.textContent?.trim() === "Connect wallet");
        expect(walletButton).toBeDefined();
        // SAFETY: the assertion above proved exactly one match was found, so
        // the element is that button.
        (walletButton as HTMLButtonElement).click();
        await vi.waitFor(() => expect(exchange.loginWithWallet).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
      });
    } finally {
      Object.defineProperty(window, "ethereum", {
        configurable: true,
        value: originalEthereum,
      });
    }

    expect(exchange.loginWithWallet).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });
});
