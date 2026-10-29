// @vitest-environment jsdom
import { ApiClientError } from "@pirate/api-client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createBrowserSessionRenewal, type BrowserSessionRenewalOptions } from "./browser-session-renewal.ts";
import { SessionAuthorityChangedError } from "./browser-auth-coordination.ts";
import { forgetSessionAuthority } from "./browser-session-events.ts";

afterEach(() => vi.useRealTimers());

function fixture(timeoutMs?: number) {
  let current = true;
  const request = vi.fn(async (_signal: AbortSignal) => ({ user_id: "account" }));
  const options: BrowserSessionRenewalOptions = {
    key: 1, current: () => current, request,
    lock: action => action(), expectedAccount: "account",
  };
  return { store: createBrowserSessionRenewal(timeoutMs), request, options, retire: () => { current = false; forgetSessionAuthority(); } };
}

describe("owned cookie renewal", () => {
  test("coalesces fresh startup without a provider and does not cache renewal authority", async () => {
    const f = fixture();
    const first = f.store.renew(f.options);
    const concurrent = f.store.renew(f.options);
    expect(first).toBe(concurrent);
    await expect(first).resolves.toBe("renewed");
    expect(f.request).toHaveBeenCalledOnce();
    await expect(f.store.renew(f.options)).resolves.toBe("renewed");
    expect(f.request).toHaveBeenCalledTimes(2);
  });

  test("only an authoritative 401 is an anonymous result", async () => {
    const f = fixture();
    const error = (status: number, message: string) => new ApiClientError(
      { status, code: "auth_error", name: "AuthError", retryable: false },
      { error: { code: "auth_error", message, retryable: false } },
    );
    f.request.mockRejectedValueOnce(error(401, "refused"));
    await expect(f.store.renew(f.options)).resolves.toBe("rejected");
    f.request.mockRejectedValueOnce(error(503, "unavailable"));
    await expect(f.store.renew(f.options)).rejects.toThrow("unavailable");
    f.request.mockRejectedValueOnce(new TypeError("offline"));
    await expect(f.store.renew(f.options)).rejects.toThrow("offline");
  });

  test("checks the account after renewal and refuses a replacement account", async () => {
    const f = fixture();
    f.request.mockResolvedValue({ user_id: "other-account" });
    await expect(f.store.renew(f.options)).rejects.toBeInstanceOf(SessionAuthorityChangedError);
  });

  test("fences logout while queued for a cross-tab lock before sending credentials", async () => {
    const f = fixture();
    let enter!: () => void;
    const waiting = f.store.renew({ ...f.options, lock: action => new Promise((resolve, reject) => {
      enter = () => { void action().then(resolve, reject); };
    }) });
    const rejected = expect(waiting).rejects.toBeInstanceOf(SessionAuthorityChangedError);
    f.retire(); enter();
    await rejected;
    expect(f.request).not.toHaveBeenCalled();
  });

  test("cancels a stalled renewal on account change even when fetch ignores abort", async () => {
    const f = fixture();
    let signal: AbortSignal | undefined;
    f.request.mockImplementation(value => { signal = value; return new Promise(() => {}); });
    const pending = f.store.renew(f.options);
    const rejected = expect(pending).rejects.toBeInstanceOf(SessionAuthorityChangedError);
    f.retire();
    await rejected;
    expect(signal?.aborted).toBe(true);
  });

  test("bounds a stalled renewal and permits a later explicit retry", async () => {
    vi.useFakeTimers();
    const f = fixture(100);
    f.request.mockImplementationOnce(() => new Promise(() => {}));
    const pending = f.store.renew(f.options);
    const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(100); await rejected;
    await expect(f.store.renew(f.options)).resolves.toBe("renewed");
  });
});
