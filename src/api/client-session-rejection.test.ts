// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createGeneratedApiClient, createSessionApiClient } from "./client.ts";
import { browserIdentitySession } from "./browser-identity-session.ts";
import { SESSION_REJECTED_EVENT } from "./browser-session-events.ts";
import type { ApiFetch } from "./proxy.ts";
import { clearSession, invalidateSession, onSessionCleared, onSessionRefreshed, refreshSession, resolveAccountSession, resolveSession } from "./session.ts";

const cleanups: Array<() => void> = [];
beforeEach(() => { clearSession(); refreshSession(); });
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  clearSession();
  vi.unstubAllGlobals();
});

async function establishSession() {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({
    id: "account-current", object: "user", verification_state: "unverified", created: 1788495833,
    verification_capabilities: Object.fromEntries(
      ["unique_human", "age_over_18", "minimum_age", "nationality", "gender", "wallet_score"].map(key => [key, { state: "unverified" }]),
    ),
  })));
  await expect(resolveAccountSession()).resolves.toMatchObject({ userId: "account-current" });
}

function observeRejection() {
  const rejected = vi.fn();
  window.addEventListener(SESSION_REJECTED_EVENT, rejected);
  cleanups.push(() => window.removeEventListener(SESSION_REJECTED_EVENT, rejected));
  return rejected;
}

function transport(fetchImpl: ApiFetch) {
  return createGeneratedApiClient((_origin, options) => ({
    read: (signal?: AbortSignal) => options.fetchImpl!("https://pirate.sc/users/me", { credentials: "same-origin", signal }),
    readRequest: (request: Request) => options.fetchImpl!(request),
    write: () => options.fetchImpl!("https://pirate.sc/posts", { method: "POST", credentials: "same-origin" }),
  }), { origin: "https://pirate.sc", fetchImpl }, { credentials: "same-origin" });
}

describe("session refusal at the real client/store boundary", () => {
  test("anonymous account and persona reads do not reject a session or refresh mounted routes", async () => {
    const rejected = observeRejection();
    const refreshed = vi.fn();
    cleanups.push(onSessionRefreshed(refreshed));
    const fetchImpl = vi.fn(async () => Response.json({ error: { code: "auth_error", message: "Not authenticated", retryable: false } }, { status: 401 }));
    const client = createSessionApiClient({ origin: "https://pirate.sc", fetchImpl });
    await expect(resolveSession({ client })).resolves.toBe("anonymous");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(rejected).not.toHaveBeenCalled();
    expect(refreshed).not.toHaveBeenCalled();
  });

  test("concurrent refused reads invalidate an established account once without signing out", async () => {
    await establishSession();
    const rejected = observeRejection();
    const refreshed = vi.fn();
    const cleared = vi.fn();
    cleanups.push(onSessionRefreshed(refreshed), onSessionCleared(cleared));
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));
    const client = transport(fetchImpl);
    await Promise.all([client.read(), client.read(), client.read()]);
    await client.read();
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(refreshed).toHaveBeenCalledTimes(1);
    expect(cleared).not.toHaveBeenCalled();
    await expect(resolveAccountSession()).resolves.toBe("anonymous");
  });

  test("caller abort after successful renewal does not replay or invalidate identity", async () => {
    await establishSession();
    let complete!: (renewed: boolean) => void;
    const renew = vi.fn(() => new Promise<boolean>(resolve => { complete = resolve; }));
    browserIdentitySession.retain({ renew, clear() {} });
    const rejected = observeRejection();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));
    const controller = new AbortController();
    const pending = transport(fetchImpl).read(controller.signal);
    await vi.waitFor(() => expect(renew).toHaveBeenCalledOnce());
    controller.abort();
    complete(true);
    await pending;
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(rejected).not.toHaveBeenCalled();
    await expect(resolveAccountSession()).resolves.toMatchObject({ userId: "account-current" });
  });

  test("an old renewal cannot reject or replay into a replacement provider session", async () => {
    await establishSession();
    const renew = vi.fn(() => new Promise<boolean>(() => {}));
    browserIdentitySession.retain({ renew, clear() {} });
    const rejected = observeRejection();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));
    const pending = transport(fetchImpl).read();
    await vi.waitFor(() => expect(renew).toHaveBeenCalledOnce());
    browserIdentitySession.retain({ renew: async () => true, clear() {} });
    await pending;
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(rejected).not.toHaveBeenCalled();
  });

  test("honours an abort signal carried by the original Request", async () => {
    await establishSession();
    let complete!: (renewed: boolean) => void;
    const renew = vi.fn(() => new Promise<boolean>(resolve => { complete = resolve; }));
    browserIdentitySession.retain({ renew, clear() {} });
    const rejected = observeRejection();
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));
    const controller = new AbortController();
    const pending = transport(fetchImpl).readRequest(new Request("https://pirate.sc/users/me", { credentials: "same-origin", signal: controller.signal }));
    await vi.waitFor(() => expect(renew).toHaveBeenCalledOnce());
    controller.abort(); complete(true);
    await pending;
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(rejected).not.toHaveBeenCalled();
  });

  test("a late account response cannot restore rejected identity or rearm rejection", async () => {
    await establishSession();
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
    refreshSession();
    const pending = resolveAccountSession();
    invalidateSession();
    finish(Response.json({ id: "late-account", object: "user", verification_state: "unverified", created: 1788495833,
      verification_capabilities: Object.fromEntries(["unique_human", "age_over_18", "minimum_age", "nationality", "gender", "wallet_score"].map(key => [key, { state: "unverified" }])) }));
    await pending;
    const rejected = observeRejection();
    await transport(vi.fn(async () => new Response(null, { status: 401 }))).read();
    expect(rejected).not.toHaveBeenCalled();
    await expect(resolveAccountSession()).resolves.toBe("anonymous");
  });

  test("a refused write never renews or replays and preserves deliberate sign-out semantics", async () => {
    await establishSession();
    const renew = vi.fn(async () => true);
    browserIdentitySession.retain({ renew, clear() {} });
    const cleared = vi.fn();
    cleanups.push(onSessionCleared(cleared));
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }));
    await transport(fetchImpl).write();
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(renew).not.toHaveBeenCalled();
    expect(cleared).not.toHaveBeenCalled();
    clearSession();
    expect(cleared).toHaveBeenCalledOnce();
  });
});
