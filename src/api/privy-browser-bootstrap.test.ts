// @vitest-environment jsdom
import { describe, expect, test, vi } from "vitest";
import { restoreBrowserIdentitySession } from "./privy-browser-bootstrap.ts";
import type { PrivyAuthClient } from "./privy-session.ts";
import { createBrowserIdentitySessionStore } from "./browser-identity-session.ts";
import { captureSessionAuthority, establishSessionAuthority, isCurrentSessionAuthority } from "./browser-session-events.ts";
import { refreshSession } from "./session.ts";

const subject = "did:privy:bootstrap-test";
const token = `header.${btoa(JSON.stringify({ sub: subject }))}.signature`;
function fixture() {
  const control = new AbortController();
  const dispose = vi.fn();
  const clock = { now: 1000 };
  const provider: PrivyAuthClient = {
    auth: { email: { sendCode: async () => ({ success: true }), loginWithCode: async () => {} } },
    initialize: vi.fn(async () => {}),
    getAccessToken: vi.fn(async () => token),
    dispose,
  };
  const dependencies = {
    config: vi.fn(async () => ({ enabled: true as const, privyAppId: "app" })),
    restore: vi.fn(() => ({ subject, accountId: "account", expiresAt: 2000 })),
    createPrivy: vi.fn(async () => provider),
    account: vi.fn(async (): Promise<string | undefined> => "account"),
    exchange: vi.fn(async () => "account"),
    current: vi.fn(() => true),
    fenceRenewal: () => () => true,
    now: () => clock.now,
  };
  return { control, provider, dependencies, dispose, clock,
    run: () => restoreBrowserIdentitySession("account", control.signal, dependencies.current, dependencies) };
}

describe("same-account browser identity bootstrap", () => {
  test("renews the same account after an ordinary store refresh and later cookie expiry", async () => {
    const f = fixture();
    establishSessionAuthority();
    const initial = captureSessionAuthority();
    const store = createBrowserIdentitySessionStore();
    const { fenceRenewal: _fence, current: _current, ...dependencies } = f.dependencies;
    expect(await store.bootstrap(signal => restoreBrowserIdentitySession("account", signal,
      () => isCurrentSessionAuthority(initial), dependencies))).toBe(true);
    refreshSession();
    expect(captureSessionAuthority()).not.toBe(initial);
    f.dependencies.account.mockResolvedValue(undefined);
    expect(await store.renew()).toBe(true);
    expect(f.dependencies.exchange).toHaveBeenCalledOnce();
    store.clear();
  });
  test("restores renewal only after fresh matching reads, without exchanging or activating a wallet", async () => {
    const f = fixture();
    const session = await f.run();
    expect(session).toBeDefined();
    expect(f.dependencies.account).toHaveBeenCalledTimes(2);
    expect(f.dependencies.exchange).not.toHaveBeenCalled();
    expect(session?.activatePersonaWallet).toBeUndefined();
    f.dependencies.account.mockResolvedValue(undefined);
    expect(await session?.renew(new AbortController().signal)).toBe(true);
    expect(f.dependencies.exchange).toHaveBeenCalledOnce();
    session?.clear();
    expect(await session?.renew(new AbortController().signal)).toBe(false);
  });

  test.each([undefined, "other-account"])("refuses fresh account %s without exchanging saved credentials", async account => {
    const f = fixture();
    f.dependencies.account.mockResolvedValue(account);
    expect(await f.run()).toBeUndefined();
    expect(f.dependencies.createPrivy).not.toHaveBeenCalled();
    expect(f.dependencies.exchange).not.toHaveBeenCalled();
  });

  test.each(["legacy", "wrong-account", "expired"])("refuses %s snapshot before provider initialization", async kind => {
    const f = fixture();
    f.dependencies.restore.mockReturnValue({ subject, accountId: kind === "legacy" ? "" : kind === "wrong-account" ? "other" : "account", expiresAt: kind === "expired" ? 1000 : 2000 });
    expect(await f.run()).toBeUndefined();
    expect(f.dependencies.createPrivy).not.toHaveBeenCalled();
  });

  test("rejects a provider identity change and disposes the memory-only client", async () => {
    const f = fixture();
    f.provider.getAccessToken = async () => `header.${btoa(JSON.stringify({ sub: "did:privy:other" }))}.signature`;
    expect(await f.run()).toBeUndefined();
    expect(f.dispose).toHaveBeenCalled();
    expect(f.dependencies.exchange).not.toHaveBeenCalled();
  });

  test("rejects expiry during initialization without extending the snapshot", async () => {
    const f = fixture();
    f.provider.initialize = async () => { f.clock.now = 2000; };
    expect(await f.run()).toBeUndefined();
    expect(f.dependencies.restore).toHaveBeenCalledOnce();
    expect(f.dispose).toHaveBeenCalled();
  });

  test("rejects account replacement during initialization or before renewal", async () => {
    const f = fixture();
    f.dependencies.account.mockResolvedValueOnce("account").mockResolvedValue("other");
    expect(await f.run()).toBeUndefined();
    expect(f.dependencies.exchange).not.toHaveBeenCalled();
    const next = fixture();
    const session = await next.run();
    next.dependencies.account.mockResolvedValue("other");
    expect(await session?.renew(new AbortController().signal)).toBe(false);
    expect(next.dependencies.exchange).not.toHaveBeenCalled();
    session?.clear();
  });

  test("disposes a late provider after logout and never issues an exchange", async () => {
    const f = fixture();
    let finish!: (value: PrivyAuthClient) => void;
    f.dependencies.createPrivy.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.run();
    await vi.waitFor(() => expect(f.dependencies.createPrivy).toHaveBeenCalledOnce());
    f.control.abort(); finish(f.provider);
    expect(await pending).toBeUndefined();
    expect(f.dispose).toHaveBeenCalled();
    expect(f.dependencies.exchange).not.toHaveBeenCalled();
  });
});
