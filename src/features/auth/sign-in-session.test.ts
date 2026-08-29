import { afterEach, describe, expect, test, vi } from "vitest";
import { createRoot, createSignal, flush } from "solid-js";

import { PrivyIdentityBootstrapRequired, type PrivySessionExchange } from "../../api/privy-session.ts";
import { createSignInSession } from "./sign-in-session.ts";

const disposers: Array<() => void> = [];

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
  window.history.replaceState({}, "", "/auth/sign-in");
});

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });
  return { promise, resolve, reject };
}

/** Lets the microtask queue drain so awaited attempts settle. */
async function settle(): Promise<void> {
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  flush();
}

function fakeExchange(overrides: Partial<PrivySessionExchange> = {}) {
  const clear = vi.fn();
  const exchange: PrivySessionExchange = {
    beginOAuth: vi.fn(async () => "https://privy.example.test/authorize"),
    clear,
    completeOAuth: vi.fn(async () => undefined),
    loginWithCode: vi.fn(async () => undefined),
    loginWithWallet: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    sendCode: vi.fn(async () => undefined),
    ...overrides,
  };
  return exchange;
}

/**
 * jsdom refuses a real navigation, so the assign call is replaced for the
 * duration of the check and restored afterwards.
 */
async function withStubbedNavigation(assign: () => void, body: () => Promise<void>): Promise<void> {
  const original = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...original, assign, origin: original.origin, href: original.href },
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

function harness(options: {
  createExchange: () => Promise<PrivySessionExchange>;
  enabled?: () => boolean;
  onAuthenticated?: () => void;
}) {
  return createRoot((dispose) => {
    disposers.push(dispose);
    const session = createSignInSession({
      createExchange: options.createExchange,
      enabled: options.enabled,
      onAuthenticated: options.onAuthenticated,
    });
    flush();
    return session;
  });
}

describe("sign-in session controller", () => {
  test("builds no exchange while the surface is disabled", async () => {
    const createExchange = vi.fn(async () => fakeExchange());
    const session = harness({ createExchange, enabled: () => false });
    await settle();

    expect(createExchange).not.toHaveBeenCalled();
    expect(session.state().phase).toBe("loading");
  });

  test("builds one exchange when enabled and resolves to the method list", async () => {
    const createExchange = vi.fn(async () => fakeExchange());
    const session = harness({ createExchange });
    await settle();

    expect(createExchange).toHaveBeenCalledTimes(1);
    expect(session.state().phase).toBe("choose");
  });

  test("clears the exchange when the surface is disabled again", async () => {
    const exchange = fakeExchange();
    const [enabled, setEnabled] = createSignal(true);
    harness({ createExchange: async () => exchange, enabled });
    await settle();
    expect(exchange.clear).not.toHaveBeenCalled();

    setEnabled(false);
    flush();
    expect(exchange.clear).toHaveBeenCalledTimes(1);
  });

  test("reports an unavailable surface when the exchange cannot be built", async () => {
    const session = harness({ createExchange: async () => { throw new Error("no config"); } });
    await settle();

    expect(session.state().phase).toBe("unavailable");
  });

  test("returns a failed provider return to the method list", async () => {
    window.history.replaceState({}, "", "/auth/sign-in?provider=google&code=abc&state=xyz");
    const exchange = fakeExchange({
      completeOAuth: vi.fn(async () => { throw new Error("boom"); }),
    });
    const session = harness({ createExchange: async () => exchange });
    await settle();

    expect(exchange.completeOAuth).toHaveBeenCalledTimes(1);
    expect(session.state().phase).toBe("choose");
    expect(session.state().message).toBe("Couldn’t sign in. Try again.");
  });

  /**
   * A first visit has no account yet. That needs no decision from the user, so
   * the controller registers and signs them in rather than presenting a step.
   */
  test("registers a first-visit provider return without asking", async () => {
    window.history.replaceState({}, "", "/auth/sign-in?provider=google&code=abc&state=xyz");
    const register = vi.fn(async () => undefined);
    const exchange = fakeExchange({
      completeOAuth: vi.fn(async () => {
        throw new PrivyIdentityBootstrapRequired("did:privy:operator");
      }),
      register,
    });
    const session = harness({ createExchange: async () => exchange });
    await settle();
    await settle();

    expect(register).toHaveBeenCalledTimes(1);
    expect(session.state().phase).toBe("signed-in");
  });

  test("drops an attempt that completes after the surface was disabled", async () => {
    const pending = deferred<void>();
    const exchange = fakeExchange({ loginWithWallet: vi.fn(() => pending.promise) });
    const onAuthenticated = vi.fn();
    const [enabled, setEnabled] = createSignal(true);
    const session = harness({ createExchange: async () => exchange, enabled, onAuthenticated });
    await settle();

    session.chooseMethod("wallet");
    flush();
    expect(session.state().phase).toBe("working");

    setEnabled(false);
    flush();
    pending.resolve();
    await settle();

    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(session.state().phase).toBe("working");
  });

  test("drops a stale attempt after the surface was reopened on a new exchange", async () => {
    const pending = deferred<void>();
    const first = fakeExchange({ sendCode: vi.fn(() => pending.promise) });
    const second = fakeExchange();
    const exchanges = [first, second];
    const [enabled, setEnabled] = createSignal(true);
    const session = harness({
      createExchange: async () => exchanges.shift() ?? second,
      enabled,
    });
    await settle();

    session.setEmail("operator@example.test");
    flush();
    session.sendCode();
    flush();
    expect(first.sendCode).toHaveBeenCalledTimes(1);

    setEnabled(false);
    flush();
    setEnabled(true);
    flush();
    await settle();
    expect(session.state().phase).toBe("choose");

    // The first exchange's request now resolves against a surface it no longer owns.
    pending.resolve();
    await settle();

    expect(session.state().phase).toBe("choose");
  });

  test("does not redirect for a provider ceremony the user dismissed", async () => {
    const pending = deferred<string>();
    const exchange = fakeExchange({ beginOAuth: vi.fn(() => pending.promise) });
    const assign = vi.fn();
    const [enabled, setEnabled] = createSignal(true);
    const session = harness({ createExchange: async () => exchange, enabled });
    await settle();

    await withStubbedNavigation(assign, async () => {
      session.chooseMethod("google");
      flush();
      expect(exchange.beginOAuth).toHaveBeenCalledTimes(1);

      setEnabled(false);
      flush();
      pending.resolve("https://privy.example.test/authorize");
      await settle();
    });

    expect(assign).not.toHaveBeenCalled();
  });

  test("reopening starts from loading and resolves to the method list again", async () => {
    const [enabled, setEnabled] = createSignal(true);
    const exchanges = [fakeExchange(), fakeExchange()];
    const session = harness({
      createExchange: async () => exchanges.shift() ?? fakeExchange(),
      enabled,
    });
    await settle();

    session.setEmail("operator@example.test");
    flush();
    session.chooseMethod("email");
    flush();
    expect(session.state().phase).toBe("email");

    setEnabled(false);
    flush();
    setEnabled(true);
    flush();
    expect(session.state().phase).toBe("loading");

    await settle();
    expect(session.state().phase).toBe("choose");
  });

  test("does not start an attempt before an exchange exists", async () => {
    const session = harness({ createExchange: async () => fakeExchange(), enabled: () => false });
    await settle();

    session.setEmail("operator@example.test");
    flush();
    session.sendCode();
    session.submitCode();
    flush();

    expect(session.state().phase).toBe("loading");
    expect(session.state().busy).toBe(false);
  });
});
