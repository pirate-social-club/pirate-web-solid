/** @jsxImportSource @solidjs/web */
import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PrivySessionExchange } from "../../api/privy-session.ts";
import { GlobalSignInHost, GLOBAL_SIGN_IN_EVENT, requestGlobalSignInCompletion } from "./global-sign-in-host.tsx";
import { SIGN_IN_LOCK_MS } from "./sign-in-modal.tsx";

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

/**
 * Installs an injected wallet so the method list offers "Connect wallet", and
 * returns a function that restores the original property.
 */
function stubInjectedWallet(): () => void {
  // SAFETY: jsdom defines no injected provider, so this optional property is
  // absent outside these tests and is restored by the returned function.
  const original = (window as Window & { ethereum?: unknown }).ethereum;
  Object.defineProperty(window, "ethereum", { configurable: true, value: { request: vi.fn() } });
  return () => Object.defineProperty(window, "ethereum", { configurable: true, value: original });
}

function button(name: string): HTMLButtonElement | undefined {
  return Array.from(document.querySelectorAll("button"))
    .find(candidate => candidate.textContent?.trim() === name || candidate.getAttribute("aria-label") === name);
}

function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

afterEach(() => {
  vi.useRealTimers();
  while (disposers.length > 0) disposers.pop()?.();
  document.body.replaceChildren();
});

describe("global sign-in host", () => {
  test("completion requests reuse ordinary sign-in and cancel on dismissal or route exit", async () => {
    render(() => <GlobalSignInHost createExchange={async () => fakeExchange()} refresh={() => {}} />);
    const first = new AbortController();
    const completion = requestGlobalSignInCompletion(first.signal);
    await settle();
    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Sign in");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await expect(completion).resolves.toBe(false);
    const second = new AbortController();
    const abandoned = requestGlobalSignInCompletion(second.signal);
    second.abort();
    await expect(abandoned).resolves.toBe(false);
  });

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

  test("a plain open request keeps a pending continuation, which authentication resolves", async () => {
    const exchange = fakeExchange();
    // SAFETY: jsdom defines no injected provider, so this optional property is
    // absent outside this test and is restored in the finally block below.
    const originalEthereum = (window as Window & { ethereum?: unknown }).ethereum;
    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request: vi.fn() },
    });
    const container = render(() => (
      <GlobalSignInHost createExchange={async () => exchange} refresh={() => {}} />
    ));

    try {
      const controller = new AbortController();
      let settled: boolean | undefined;
      const completion = requestGlobalSignInCompletion(controller.signal);
      void completion.then((authenticated) => { settled = authenticated; });
      // The Study and Karaoke wallet confirmation used to follow its
      // continuation with an ordinary open request, which cancelled it.
      window.dispatchEvent(new CustomEvent(GLOBAL_SIGN_IN_EVENT));
      await settle();
      expect(settled).toBeUndefined();
      expect(document.querySelector("[role='dialog']")).not.toBeNull();

      const walletButton = Array.from(container.ownerDocument.querySelectorAll("button"))
        .find(button => button.textContent?.trim() === "Connect wallet");
      expect(walletButton).toBeDefined();
      // SAFETY: the assertion above proved exactly one match was found, so
      // the element is that button.
      (walletButton as HTMLButtonElement).click();
      await expect(completion).resolves.toBe(true);
    } finally {
      Object.defineProperty(window, "ethereum", {
        configurable: true,
        value: originalEthereum,
      });
    }
  });

  test("a newer continuation still supersedes an older one", async () => {
    render(() => <GlobalSignInHost createExchange={async () => fakeExchange()} refresh={() => {}} />);
    const older = requestGlobalSignInCompletion(new AbortController().signal);
    const newer = requestGlobalSignInCompletion(new AbortController().signal);
    await expect(older).resolves.toBe(false);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await expect(newer).resolves.toBe(false);
  });

  test("a provider request that never settles locks the dialog only for a bounded time", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const restore = stubInjectedWallet();
    const refresh = vi.fn();
    const exchange = fakeExchange();
    exchange.loginWithWallet = vi.fn(() => new Promise<void>(() => {}));
    try {
      render(() => <GlobalSignInHost createExchange={async () => exchange} refresh={refresh} />);
      let outcome: boolean | undefined;
      void requestGlobalSignInCompletion(new AbortController().signal).then(value => { outcome = value; });
      await vi.advanceTimersByTimeAsync(0);
      button("Connect wallet")?.click();
      await vi.advanceTimersByTimeAsync(0);
      expect(exchange.loginWithWallet).toHaveBeenCalledTimes(1);
      expect(document.body.textContent).toContain("Signing in…");

      // Locked while signing in: Close stays visible but disabled, and neither
      // it nor Escape closes the dialog.
      expect(button("Close")?.disabled).toBe(true);
      button("Close")?.click();
      pressEscape();
      await vi.advanceTimersByTimeAsync(SIGN_IN_LOCK_MS - 1);
      expect(document.querySelector("[role='dialog']")).not.toBeNull();
      expect(button("Close")?.disabled).toBe(true);
      expect(outcome).toBeUndefined();

      // The lock expires; five minutes on, the stalled request still has a way out.
      await vi.advanceTimersByTimeAsync(1);
      expect(button("Close")?.disabled).toBe(false);
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(document.body.textContent).toContain("Signing in…");
      expect(button("Close")?.disabled).toBe(false);
      pressEscape();
      await vi.advanceTimersByTimeAsync(0);
      expect(document.querySelector("[role='dialog']")).toBeNull();
      expect(outcome).toBe(false);
      expect(refresh).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  test("a provider result that settles after the lock expires is handled either way", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const restore = stubInjectedWallet();
    const refresh = vi.fn();
    const exchange = fakeExchange();
    const pending: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
    exchange.loginWithWallet = vi.fn(() => new Promise<void>((resolve, reject) => { pending.push({ resolve, reject }); }));
    try {
      render(() => <GlobalSignInHost createExchange={async () => exchange} refresh={refresh} />);
      let outcome: boolean | undefined;
      void requestGlobalSignInCompletion(new AbortController().signal).then(value => { outcome = value; });
      await vi.advanceTimersByTimeAsync(0);

      // A late failure while the dialog is still open returns to the method
      // list with the error, and the dialog can close.
      button("Connect wallet")?.click();
      await vi.advanceTimersByTimeAsync(SIGN_IN_LOCK_MS);
      pending[0]?.reject(new Error("wallet rejected"));
      await vi.advanceTimersByTimeAsync(0);
      expect(document.body.textContent).not.toContain("Signing in…");
      expect(button("Connect wallet")).toBeDefined();
      expect(button("Close")?.disabled).toBe(false);

      // A second attempt locks again, then the user closes after the lock
      // expires. Its late success is discarded: no sign-in, no refresh.
      button("Connect wallet")?.click();
      await vi.advanceTimersByTimeAsync(0);
      expect(button("Close")?.disabled).toBe(true);
      await vi.advanceTimersByTimeAsync(SIGN_IN_LOCK_MS);
      pressEscape();
      await vi.advanceTimersByTimeAsync(0);
      expect(document.querySelector("[role='dialog']")).toBeNull();
      expect(outcome).toBe(false);
      pending[1]?.resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(refresh).not.toHaveBeenCalled();
      expect(document.querySelector("[role='dialog']")).toBeNull();
    } finally {
      restore();
    }
  });
});
