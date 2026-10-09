import { describe, expect, test, vi } from "vitest";
import { createBrowserIdentitySessionStore, browserIdentitySession } from "./browser-identity-session";
import { createGeneratedApiClient } from "./client";

describe("page-local identity recovery", () => {
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
