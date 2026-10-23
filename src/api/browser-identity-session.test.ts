// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { createBrowserIdentitySessionStore, browserIdentitySession } from "./browser-identity-session";
import { createGeneratedApiClient } from "./client";

describe("page-local identity recovery", () => {
  test("fences late bootstrap after explicit sign-in and bounds a stalled restore", async () => {
    const store = createBrowserIdentitySessionStore(5);
    let finish!: (value: { renew(): Promise<boolean>; clear(): void }) => void;
    const lateClear = vi.fn();
    const pending = store.bootstrap(() => new Promise(resolve => { finish = resolve; }));
    store.retain({ renew: async () => true, clear: vi.fn() });
    expect(await pending).toBe(false);
    finish({ renew: async () => false, clear: lateClear });
    await Promise.resolve();
    expect(lateClear).toHaveBeenCalledOnce();
    expect(await store.renew()).toBe(true);
    store.clear();
    expect(await store.bootstrap(() => new Promise(() => {}))).toBe(false);
  });
  test("retires profile activation promptly on account replacement even when the provider stalls", async () => {
    const store = createBrowserIdentitySessionStore();
    let activationSignal: AbortSignal | undefined;
    const activatePersonaWallet = vi.fn((_account, _persona, _key, signal: AbortSignal) => { activationSignal = signal; return new Promise<void>(() => {}); });
    store.retain({ renew: async () => true, clear: vi.fn(), activatePersonaWallet });
    const result = store.activatePersonaWallet("account", "profile", "wallet-key", new AbortController().signal);
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    store.retain({ renew: async () => true, clear: vi.fn() });
    await rejected;
    expect(activationSignal?.aborted).toBe(true);
    expect(await store.activatePersonaWallet("other", "other-profile", "key", new AbortController().signal)).toBe(false);
    store.clear();
  });
  test("bounds a stalled profile wallet activation", async () => {
    vi.useFakeTimers();
    try {
      const store = createBrowserIdentitySessionStore(30_000);
      let signal: AbortSignal | undefined;
      store.retain({ renew: async () => true, clear: vi.fn(), activatePersonaWallet: (_account, _profile, _key, value) => { signal = value; return new Promise(() => {}); } });
      const result = store.activatePersonaWallet("account", "profile", "wallet-key", new AbortController().signal);
      const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
      await vi.advanceTimersByTimeAsync(30_000); await rejected;
      expect(signal?.aborted).toBe(true); store.clear();
    } finally { vi.useRealTimers(); }
  });
  test("coalesces concurrent recovery and rejects completion after logout", async () => {
    const store = createBrowserIdentitySessionStore();
    let complete!: (value: boolean) => void;
    let signal: AbortSignal | undefined;
    const renew = vi.fn((value: AbortSignal) => {
      signal = value;
      return new Promise<boolean>(resolve => { complete = resolve; });
    });
    const clear = vi.fn();
    store.retain({ renew, clear });
    const first = store.renew();
    const second = store.renew();
    expect(renew).toHaveBeenCalledTimes(1);
    store.clear();
    expect(signal?.aborted).toBe(true);
    complete(true);
    expect(await first).toBe(false);
    expect(await second).toBe(false);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(await store.renew()).toBe(false);
  });

  test("clears failed provider credentials instead of retrying them indefinitely", async () => {
    const store = createBrowserIdentitySessionStore();
    const clear = vi.fn();
    const renew = vi.fn(async () => { throw new Error("provider session expired"); });
    store.retain({ clear, renew });
    expect(await store.renew()).toBe(false);
    expect(await store.renew()).toBe(false);
    expect(renew).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
  });

  test("bounds a stalled exchange and aborts its credentialed request", async () => {
    vi.useFakeTimers();
    try {
      const store = createBrowserIdentitySessionStore(30_000);
      let signal: AbortSignal | undefined;
      const clear = vi.fn();
      store.retain({ clear, renew: value => { signal = value; return new Promise(() => {}); } });
      const pending = store.renew();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await pending).toBe(false);
      expect(signal?.aborted).toBe(true);
      expect(clear).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  test.each(["GET", "POST"])("recovers a rejected %s without replaying unsafe requests", async method => {
    const renew = vi.fn(async () => true);
    browserIdentitySession.retain({ renew, clear: () => {} });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    try {
      const client = createGeneratedApiClient((_origin, options) => ({
        request: () => {
          if (options.fetchImpl === undefined) throw new Error("missing transport");
          return options.fetchImpl("https://pirate.sc/users/me", { method, credentials: "same-origin" });
        },
      }), { origin: "https://pirate.sc", fetchImpl }, { credentials: "same-origin" });
      expect((await client.request()).status).toBe(method === "GET" ? 204 : 401);
      expect(fetchImpl).toHaveBeenCalledTimes(method === "GET" ? 2 : 1);
      expect(renew).toHaveBeenCalledTimes(method === "GET" ? 1 : 0);
    } finally { browserIdentitySession.clear(); }
  });
});
