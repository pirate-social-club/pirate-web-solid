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
