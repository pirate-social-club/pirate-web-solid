import { afterEach, describe, expect, test, vi } from "vitest";

import type { PrivySessionExchange } from "../../api/privy-session.ts";
import type { VerificationPublicConfig } from "../../api/verification-config.ts";
import { createSignInPreparation } from "./sign-in-preparation.ts";

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });
  return { promise, reject, resolve };
}

function fakeExchange(): PrivySessionExchange {
  return {
    beginOAuth: vi.fn(async () => "https://privy.example.test/authorize"),
    clear: vi.fn(),
    completeOAuth: vi.fn(async () => undefined),
    loginWithCode: vi.fn(async () => undefined),
    loginWithWallet: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    sendCode: vi.fn(async () => undefined),
  };
}

const config: VerificationPublicConfig = {
  enabled: true,
  privyAppId: "app_test",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("sign-in intent preparation", () => {
  test("preloads same-origin assets without creating an exchange", async () => {
    const configLoad = deferred<VerificationPublicConfig>();
    const sdkLoad = deferred<void>();
    const createExchange = vi.fn(async () => fakeExchange());
    const fetchConfig = vi.fn(() => configLoad.promise);
    const preloadSdk = vi.fn(() => sdkLoad.promise);
    const preparation = createSignInPreparation({ createExchange, fetchConfig, preloadSdk });

    preparation.preload();

    expect(fetchConfig).toHaveBeenCalledTimes(1);
    expect(preloadSdk).toHaveBeenCalledTimes(1);
    expect(createExchange).not.toHaveBeenCalled();

    configLoad.resolve(config);
    sdkLoad.resolve();
    await Promise.all([configLoad.promise, sdkLoad.promise]);

    expect(createExchange).not.toHaveBeenCalled();
  });

  test("lets committed intent and the modal share one prepared exchange", async () => {
    const configLoad = deferred<VerificationPublicConfig>();
    const sdkLoad = deferred<void>();
    const exchange = fakeExchange();
    const createExchange = vi.fn(async () => exchange);
    const preparation = createSignInPreparation({
      createExchange,
      fetchConfig: () => configLoad.promise,
      preloadSdk: () => sdkLoad.promise,
    });

    preparation.prepare();

    const acquired = preparation.acquire();
    configLoad.resolve(config);
    sdkLoad.resolve();

    await expect(acquired).resolves.toBe(exchange);
    expect(createExchange).toHaveBeenCalledOnce();
    expect(createExchange).toHaveBeenCalledWith(config);
  });

  test("memoizes public config and SDK assets across exchanges within the page", async () => {
    const fetchConfig = vi.fn(async () => config);
    const preloadSdk = vi.fn(async () => undefined);
    const createExchange = vi.fn(async () => fakeExchange());
    const preparation = createSignInPreparation({
      createExchange,
      fetchConfig,
      preloadSdk,
    });

    await preparation.acquire();
    await preparation.acquire();

    expect(fetchConfig).toHaveBeenCalledOnce();
    expect(preloadSdk).toHaveBeenCalledOnce();
    expect(createExchange).toHaveBeenCalledTimes(2);
  });

  test("clears an initialized exchange when intent is not followed by an open", async () => {
    vi.useFakeTimers();
    const exchange = fakeExchange();
    const preparation = createSignInPreparation({
      createExchange: async () => exchange,
      fetchConfig: async () => config,
      lifetimeMs: 100,
      preloadSdk: async () => undefined,
    });

    preparation.prepare();
    await vi.advanceTimersByTimeAsync(100);

    expect(exchange.clear).toHaveBeenCalledOnce();
  });

  test("retries config after a failed intent warmup", async () => {
    const fetchConfig = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(config);
    const exchange = fakeExchange();
    const preparation = createSignInPreparation({
      createExchange: async () => exchange,
      fetchConfig,
      preloadSdk: async () => undefined,
    });

    preparation.prepare();
    await new Promise((resolve) => { setTimeout(resolve, 0); });

    await expect(preparation.acquire()).resolves.toBe(exchange);
    expect(fetchConfig).toHaveBeenCalledTimes(2);
  });
});
