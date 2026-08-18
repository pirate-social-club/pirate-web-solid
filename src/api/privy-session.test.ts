import { describe, expect, it } from "vitest";
import { MemoryOnlyStorage, createPrivySessionExchange } from "./privy-session.ts";

describe("Privy session exchange", () => {
  it("keeps SDK state in memory and clears it after exchanging", async () => {
    let storage: MemoryOnlyStorage | undefined;
    let exchanged: readonly [string, string | undefined] | undefined;
    const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
      createPrivy: async (_config, candidate) => {
        // SAFETY: production passes a freshly constructed MemoryOnlyStorage to this factory.
        storage = candidate as MemoryOnlyStorage;
        candidate.put("access", "temporary");
        return {
          auth: { email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined } },
          initialize: async () => undefined,
          getAccessToken: async () => "access-token",
        };
      },
      exchange: async (access, identity) => { exchanged = [access, identity]; },
      csrf: () => "csrf",
    });
    await auth.sendCode("person@example.test");
    await auth.loginWithCode("person@example.test", "123456");
    expect(exchanged).toEqual(["access-token", undefined]);
    expect(storage?.getKeys()).toEqual([]);
  });

  it("fails closed when exchange does not establish CSRF state", async () => {
    const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
      createPrivy: async () => ({
        auth: { email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined } },
        initialize: async () => undefined,
        getAccessToken: async () => "access-token",
      }),
      exchange: async () => undefined,
      csrf: () => undefined,
    });
    await expect(auth.loginWithCode("person@example.test", "123456")).rejects.toThrow("session_failed");
  });
});
