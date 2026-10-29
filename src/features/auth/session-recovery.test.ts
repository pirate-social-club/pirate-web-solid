import { describe, expect, test, vi } from "vitest";
import { createSessionRecovery } from "./session-recovery";
import type { AccountSessionResolution } from "../../api/session";

function setup() {
  let account: AccountSessionResolution = "anonymous";
  let csrf = false;
  const dependencies = {
    account: vi.fn(async () => account),
    csrfPresent: () => csrf,
    renew: vi.fn(async () => false),
    signIn: vi.fn(async () => false),
    invalidate: vi.fn(),
    refresh: vi.fn(),
  };
  return {
    dependencies,
    recover: createSessionRecovery(dependencies),
    restore(userId = "owner") { account = { status: "authenticated", userId }; csrf = true; },
  };
}

describe("shared session continuation", () => {
  test("renews an expired session without requesting another sign-in", async () => {
    const flow = setup();
    flow.dependencies.renew.mockImplementation(async () => { flow.restore(); return true; });
    expect(await flow.recover("owner", new AbortController().signal)).toBe(true);
    expect(flow.dependencies.signIn).not.toHaveBeenCalled();
    expect(flow.dependencies.refresh).toHaveBeenCalledTimes(1);
  });

  test("requires the original account and a readable CSRF proof after sign-in", async () => {
    const flow = setup();
    flow.dependencies.signIn.mockImplementation(async () => { flow.restore("different-owner"); return true; });
    expect(await flow.recover("owner", new AbortController().signal)).toBe(false);
    expect(flow.dependencies.invalidate).toHaveBeenCalledTimes(1);
    expect(flow.dependencies.refresh).not.toHaveBeenCalled();
  });

  test("keeps a cancelled continuation from authorizing a later action", async () => {
    const flow = setup();
    const controller = new AbortController();
    flow.dependencies.signIn.mockImplementation(async () => {
      flow.restore(); controller.abort(); return true;
    });
    expect(await flow.recover("owner", controller.signal)).toBe(false);
    expect(flow.dependencies.refresh).not.toHaveBeenCalled();
  });

  test("coalesces recovery and checks each caller's account independently", async () => {
    const flow = setup();
    let complete!: (value: boolean) => void;
    flow.dependencies.renew.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const first = flow.recover("owner", new AbortController().signal);
    const second = flow.recover("other", new AbortController().signal);
    await vi.waitFor(() => expect(flow.dependencies.renew).toHaveBeenCalledTimes(1));
    flow.restore(); complete(true);
    expect(await first).toBe(true);
    expect(await second).toBe(false);
  });
});

// The real default continuation must never fall back to provider proof after
// the account transport has already attempted owned-cookie renewal.
test("default continuation requests explicit sign-in after owned renewal refusal without using the wallet provider", async () => {
  const { ensureApplicationSession } = await import("./session-recovery");
  const { browserIdentitySession } = await import("../../api/browser-identity-session");
  const { clearSession, refreshSession } = await import("../../api/session");
  const { GLOBAL_SIGN_IN_EVENT } = await import("./global-sign-in-host");
  clearSession(); refreshSession();
  const provider = vi.spyOn(browserIdentitySession, "renew");
  const prompted = vi.fn();
  const cancelPrompt = (event: Event) => {
    prompted();
    // SAFETY: the app-owned sign-in event carries this explicit completion callback.
    (event as CustomEvent<{ complete(value: boolean): void }>).detail.complete(false);
  };
  window.addEventListener(GLOBAL_SIGN_IN_EVENT, cancelPrompt);
  document.cookie = "__Host-pirate_csrf=fixture-csrf; Secure; SameSite=Lax; Path=/";
  vi.stubGlobal("navigator", { locks: { request: <T>(_name: string, _options: LockOptions, action: () => Promise<T>) => action() } });
  const paths: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    paths.push(new URL(String(input)).pathname);
    return Response.json({ error: { code: "auth_error", message: "fixture refusal", retryable: false } }, { status: 401 });
  }));
  try {
    expect(await ensureApplicationSession("owner", new AbortController().signal)).toBe(false);
    expect(paths).toEqual(["/api/users/me", "/api/auth/session/renew"]);
    expect(provider).not.toHaveBeenCalled(); expect(prompted).toHaveBeenCalledOnce();
  } finally {
    window.removeEventListener(GLOBAL_SIGN_IN_EVENT, cancelPrompt);
    provider.mockRestore(); clearSession();
    document.cookie = "__Host-pirate_csrf=; Secure; Path=/; Max-Age=0";
    vi.unstubAllGlobals();
  }
});
