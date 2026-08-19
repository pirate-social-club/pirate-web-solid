import { ApiClientError } from "@pirate/api-client";
import type { ExternalWallet } from "@privy-io/js-sdk-core";
import { describe, expect, it, vi } from "vitest";
import { MemoryOnlyStorage, createPrivySessionExchange } from "./privy-session.ts";

describe("Privy session exchange", () => {
  it("exposes headless OAuth initiation through the session adapter", async () => {
    const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
      createPrivy: async () => ({
        auth: {
          email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined },
          oauth: {
            generateURL: async provider => ({ url: `https://accounts.example/${provider}` }),
            loginWithCode: async () => undefined,
          },
        },
        initialize: async () => undefined,
        getAccessToken: async () => "access-token",
      }),
      csrf: () => "csrf",
    });

    await expect(auth.beginOAuth("google", "https://pirate.example/auth/sign-in")).resolves.toBe("https://accounts.example/google");
  });

  it("completes OAuth through Privy before exchanging the session", async () => {
    let completed: readonly [string, string, string] | undefined;
    let exchanged: string | undefined;
    const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
      createPrivy: async () => ({
        auth: {
          email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined },
          oauth: {
            generateURL: async () => ({ url: "https://accounts.example/google" }),
            loginWithCode: async (code, state, provider) => { completed = [code, state, provider]; },
          },
        },
        initialize: async () => undefined,
        getAccessToken: async () => "oauth-access-token",
      }),
      exchange: async accessToken => { exchanged = accessToken; },
      csrf: () => "csrf",
    });

    await auth.completeOAuth("google", "authorization-code", "returned-state");
    expect(completed).toEqual(["authorization-code", "returned-state", "google"]);
    expect(exchanged).toBe("oauth-access-token");
  });

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

  it("offers explicit registration after a valid Privy identity is not provisioned", async () => {
    const accessToken = "header.eyJzdWIiOiJkaWQ6cHJpdnk6dGVzdC11c2VyIn0.signature";
    let registered: string | undefined;
    const unauthorized = new ApiClientError(
      { status: 401, code: "auth_error", name: "AuthError", retryable: false },
      { error: { code: "auth_error", message: "not registered", retryable: false } },
    );
    const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
      createPrivy: async () => ({
        auth: { email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined } },
        initialize: async () => undefined,
        getAccessToken: async () => accessToken,
      }),
      exchange: async () => { throw unauthorized; },
      register: async token => { registered = token; },
      csrf: () => "csrf",
    });

    await expect(auth.loginWithCode("person@example.test", "123456")).rejects.toMatchObject({
      name: "PrivyIdentityBootstrapRequired",
      sourceUserId: "did:privy:test-user",
    });
    await auth.register();
    expect(registered).toBe(accessToken);
  });

  it("completes injected-wallet SIWE before exchanging the session", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return ["0x0000000000000000000000000000000000000001"];
      if (method === "eth_chainId") return "0x1";
      if (method === "personal_sign") return "0xsignature";
      throw new Error(`unexpected_${method}`);
    });
    const browserLocation = { host: "localhost", origin: "http://localhost" };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: browserLocation, ethereum: { request } },
    });
    let initializedWallet: { readonly wallet: ExternalWallet; readonly domain: string; readonly uri: string } | undefined;
    let signed: readonly [string, ExternalWallet, string] | undefined;
    let exchanged: string | undefined;
    try {
      const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
        createPrivy: async () => ({
          auth: {
            email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined },
            siwe: {
              init: async (wallet, domain, uri) => {
                initializedWallet = { wallet, domain, uri };
                return { message: "sign this message" };
              },
              loginWithSiwe: async (signature, wallet, message) => { signed = [signature, wallet, message]; },
            },
          },
          initialize: async () => undefined,
          getAccessToken: async () => "wallet-access-token",
        }),
        exchange: async accessToken => { exchanged = accessToken; },
        csrf: () => "csrf",
      });

      await auth.loginWithWallet();
      expect(initializedWallet).toMatchObject({
        wallet: {
          address: "0x0000000000000000000000000000000000000001",
          chainId: "eip155:1",
          connectorType: "injected",
        },
        domain: browserLocation.host,
        uri: browserLocation.origin,
      });
      expect(signed).toEqual(["0xsignature", expect.objectContaining({ chainId: "eip155:1" }), "sign this message"]);
      expect(exchanged).toBe("wallet-access-token");
      expect(request).toHaveBeenCalledTimes(3);
    } finally {
      Reflect.deleteProperty(globalThis, "window");
    }
  });
});
