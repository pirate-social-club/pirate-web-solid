import { afterEach, describe, expect, test, vi } from "vitest";
import { createRoot, createSignal, flush } from "solid-js";

import { PrivyIdentityBootstrapRequired, type PrivySessionExchange } from "../../api/privy-session.ts";
import { createSignInSession } from "./sign-in-session.ts";

const disposers: Array<() => void> = [];

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
  window.history.replaceState({}, "", "/auth/sign-in");
  Reflect.deleteProperty(window, "ethereum");
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
  walletAvailable?: () => boolean;
}) {
  return createRoot((dispose) => {
    disposers.push(dispose);
    const session = createSignInSession({
      createExchange: options.createExchange,
      enabled: options.enabled,
      onAuthenticated: options.onAuthenticated,
      walletAvailable: options.walletAvailable,
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

  test("builds one exchange when enabled and keeps the method list ready", async () => {
    const createExchange = vi.fn(async () => fakeExchange());
    const session = harness({ createExchange });
    expect(session.state().phase).toBe("choose");
    await settle();

    expect(createExchange).toHaveBeenCalledTimes(1);
    expect(session.state().phase).toBe("choose");
  });

  test("renders methods before exchange initialization resolves", async () => {
    const pending = deferred<PrivySessionExchange>();
    const session = harness({ createExchange: () => pending.promise });

    expect(session.state().phase).toBe("choose");
    expect(session.state().busy).toBe(false);

    pending.resolve(fakeExchange());
    await settle();
    expect(session.state().phase).toBe("choose");
  });

  test("offers wallet login only while an injected provider is available", async () => {
    const [enabled, setEnabled] = createSignal(true);
    const session = harness({ createExchange: async () => fakeExchange(), enabled });
    await settle();
    expect(session.walletAvailable()).toBe(false);

    Object.defineProperty(window, "ethereum", {
      configurable: true,
      value: { request: vi.fn(async () => undefined) },
    });
    setEnabled(false);
    flush();
    setEnabled(true);
    flush();
    expect(session.walletAvailable()).toBe(true);

    Reflect.deleteProperty(window, "ethereum");
    setEnabled(false);
    flush();
    setEnabled(true);
    flush();
    expect(session.walletAvailable()).toBe(false);
  });

  test("signs in through the injected wallet exchange", async () => {
    const loginWithWallet = vi.fn(async () => undefined);
    const onAuthenticated = vi.fn();
    const session = harness({
      createExchange: async () => fakeExchange({ loginWithWallet }),
      onAuthenticated,
      walletAvailable: () => true,
    });
    await settle();

    session.chooseMethod("wallet");
    flush();
    await settle();

    expect(loginWithWallet).toHaveBeenCalledOnce();
    expect(onAuthenticated).toHaveBeenCalledOnce();
    expect(session.state().phase).toBe("signed-in");
  });

  test("registers a first-visit wallet identity only after explicit affirmation", async () => {
    const register = vi.fn(async () => undefined);
    const session = harness({
      createExchange: async () => fakeExchange({
        loginWithWallet: vi.fn(async () => {
          throw new PrivyIdentityBootstrapRequired("did:privy:wallet-user");
        }),
        register,
      }),
      walletAvailable: () => true,
    });
    await settle();

    session.chooseMethod("wallet");
    flush();
    await settle();

    expect(register).not.toHaveBeenCalled();
    expect(session.state().phase).toBe("registration");
    expect(session.state().minimumAgeAffirmed).toBe(false);

    session.submitRegistration();
    flush();
    await settle();
    expect(register).not.toHaveBeenCalled();

    session.setMinimumAgeAffirmed(true);
    flush();
    session.submitRegistration();
    flush();
    await settle();

    expect(register).toHaveBeenCalledWith({
      version: "minimum-age-attestation-v1",
      minimum_age: 16,
      affirmed: true,
    });
    expect(session.state().phase).toBe("signed-in");
  });

  test("returns wallet rejection to the usable method list", async () => {
    const session = harness({
      createExchange: async () => fakeExchange({
        loginWithWallet: vi.fn(async () => { throw new Error("wallet_auth_failed"); }),
      }),
      walletAvailable: () => true,
    });
    await settle();

    session.chooseMethod("wallet");
    flush();
    await settle();

    expect(session.state().phase).toBe("choose");
    expect(session.state().message).toBe("Wallet sign-in failed.");
  });

  test("lets email entry overlap initialization and awaits it on submit", async () => {
    const pending = deferred<PrivySessionExchange>();
    const exchange = fakeExchange();
    const session = harness({ createExchange: () => pending.promise });

    session.setEmail("operator@example.test");
    flush();
    session.sendCode();
    flush();

    expect(session.state().phase).toBe("choose");
    expect(session.state().busy).toBe(true);
    expect(exchange.sendCode).not.toHaveBeenCalled();

    pending.resolve(exchange);
    await settle();

    expect(exchange.sendCode).toHaveBeenCalledWith("operator@example.test");
    expect(session.state().phase).toBe("code");
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
    expect(session.state().phase).toBe("choose");
    await settle();

    expect(session.state().phase).toBe("unavailable");
  });

  test("clears an exchange that resolves after the surface was dismissed", async () => {
    const pending = deferred<PrivySessionExchange>();
    const exchange = fakeExchange();
    const [enabled, setEnabled] = createSignal(true);
    harness({ createExchange: () => pending.promise, enabled });

    setEnabled(false);
    flush();
    pending.resolve(exchange);
    await settle();

    expect(exchange.clear).toHaveBeenCalledOnce();
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

  test("holds a first-visit provider return for explicit affirmation", async () => {
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

    expect(register).not.toHaveBeenCalled();
    expect(session.state().phase).toBe("registration");

    session.setMinimumAgeAffirmed(true);
    flush();
    session.submitRegistration();
    flush();
    await settle();

    expect(register).toHaveBeenCalledWith({
      version: "minimum-age-attestation-v1",
      minimum_age: 16,
      affirmed: true,
    });
    expect(session.state().phase).toBe("signed-in");
  });

  test("drops an attempt that completes after the surface was disabled", async () => {
    const pending = deferred<void>();
    const exchange = fakeExchange({ sendCode: vi.fn(() => pending.promise) });
    const onAuthenticated = vi.fn();
    const [enabled, setEnabled] = createSignal(true);
    const session = harness({ createExchange: async () => exchange, enabled, onAuthenticated });
    await settle();

    session.setEmail("operator@example.test");
    flush();
    session.sendCode();
    flush();
    expect(session.state().phase).toBe("choose");
    expect(session.state().busy).toBe(true);

    setEnabled(false);
    flush();
    pending.resolve();
    await settle();

    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(session.state().phase).toBe("choose");
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
    await settle();
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
      await settle();
      expect(exchange.beginOAuth).toHaveBeenCalledTimes(1);

      setEnabled(false);
      flush();
      pending.resolve("https://privy.example.test/authorize");
      await settle();
    });

    expect(assign).not.toHaveBeenCalled();
  });

  test("reopening resets directly to a fresh method list", async () => {
    const [enabled, setEnabled] = createSignal(true);
    const exchanges = [fakeExchange(), fakeExchange()];
    const session = harness({
      createExchange: async () => exchanges.shift() ?? fakeExchange(),
      enabled,
    });
    await settle();

    session.setEmail("operator@example.test");
    flush();
    expect(session.state().phase).toBe("choose");

    setEnabled(false);
    flush();
    setEnabled(true);
    flush();
    expect(session.state().phase).toBe("choose");

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
