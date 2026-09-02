import { ApiClientError, type GetPersonasResponse } from "@pirate/api-client";
import type { ExternalWallet } from "@privy-io/js-sdk-core";
import { describe, expect, it, vi } from "vitest";
import {
  MemoryOnlyStorage,
  PrivyIdentityBootstrapRequired,
  createPrivySessionExchange,
} from "./privy-session.ts";

const minimumAgeAffirmation = {
  version: "minimum-age-attestation-v1",
  minimum_age: 16,
  affirmed: true,
} as const;

const noPersonas = async (): Promise<GetPersonasResponse> => ({ personas: [] });

function persona(
  personaId: string,
  wallet: GetPersonasResponse["personas"][number]["wallet_set"]["evm"] = null,
): GetPersonasResponse["personas"][number] {
  return {
    persona_id: personaId,
    object: "persona",
    status: "active",
    profile: {
      persona_id: personaId,
      object: "persona_profile",
      revision: 1,
      display_name: null,
      avatar_ref: null,
      cover_ref: null,
      bio: null,
      preferred_locale: null,
      primary_public_handle: null,
    },
    wallet_set: { evm: wallet },
    created_at: "2026-09-02T00:00:00.000Z",
    retired_at: null,
  };
}

describe("Privy session exchange", () => {
  const rejectFirstExchange = (error: ApiClientError) => {
    let calls = 0;
    return vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw error;
    });
  };

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
      listPersonas: noPersonas,
      register: async () => undefined,
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
      listPersonas: noPersonas,
      register: async () => undefined,
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
      listPersonas: noPersonas,
      register: async () => undefined,
      csrf: () => undefined,
    });
    await expect(auth.loginWithCode("person@example.test", "123456")).rejects.toThrow("session_failed");
  });

  it("offers explicit registration after a valid Privy identity is not provisioned", async () => {
    const accessToken = "header.eyJzdWIiOiJkaWQ6cHJpdnk6dGVzdC11c2VyIn0.signature";
    let registered: Readonly<{
      privy_access_token: string;
      minimum_age_attestation: typeof minimumAgeAffirmation;
    }> | undefined;
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
      exchange: rejectFirstExchange(unauthorized),
      listPersonas: noPersonas,
      register: async body => { registered = body; },
      csrf: () => "csrf",
    });

    await expect(auth.loginWithCode("person@example.test", "123456")).rejects.toMatchObject({
      name: "PrivyIdentityBootstrapRequired",
      sourceUserId: "did:privy:test-user",
    });
    await auth.register(minimumAgeAffirmation);
    expect(registered).toEqual({
      privy_access_token: accessToken,
      minimum_age_attestation: minimumAgeAffirmation,
    });
  });

  it("provisions the exact reserved embedded wallet before completing registration", async () => {
    const accessToken = "header.eyJzdWIiOiJkaWQ6cHJpdnk6dGVzdC11c2VyIn0.signature";
    const unauthorized = new ApiClientError(
      { status: 401, code: "auth_error", name: "AuthError", retryable: false },
      { error: { code: "auth_error", message: "not registered", retryable: false } },
    );
    let storage: MemoryOnlyStorage | undefined;
    const ensured: number[] = [];
    const prepared: Array<readonly [string, string]> = [];
    const confirmed: Array<readonly [string, string]> = [];
    const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
      createPrivy: async (_config, candidate) => {
        // SAFETY: this factory receives the MemoryOnlyStorage created by createPrivySessionExchange.
        storage = candidate as MemoryOnlyStorage;
        candidate.put("privy-session", "memory-only");
        return {
          auth: { email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined } },
          initialize: async () => undefined,
          getAccessToken: async () => accessToken,
          ensureEmbeddedEthereumWallet: async index => { ensured.push(index); },
        };
      },
      exchange: rejectFirstExchange(unauthorized),
      listPersonas: noPersonas,
      register: async () => ({
        status: "wallet_setup_required",
        wallet: {
          persona_id: "persona-1",
          chain_account_kind: "evm",
          hd_wallet_index: 3,
          status: "pending",
          assignment: null,
        },
      }),
      prepareWallet: async (personaId, key) => {
        prepared.push([personaId, key]);
        return { persona_id: personaId, hd_wallet_index: 3, status: "pending" };
      },
      confirmWallet: async (personaId, token) => {
        confirmed.push([personaId, token]);
        return { hd_wallet_index: 3 };
      },
      idempotencyKey: () => "wallet-prepare-key",
      csrf: () => "csrf",
    });

    await expect(auth.loginWithCode("person@example.test", "123456")).rejects.toBeInstanceOf(
      PrivyIdentityBootstrapRequired,
    );
    expect(storage?.getKeys()).toEqual(["privy-session"]);
    await auth.register(minimumAgeAffirmation);

    expect(prepared).toEqual([["persona-1", "wallet-prepare-key"]]);
    expect(ensured).toEqual([3]);
    expect(confirmed).toEqual([["persona-1", accessToken]]);
    expect(storage?.getKeys()).toEqual([]);
  });

  it("recovers a handle-free persona whose wallet setup is still pending", async () => {
    const accessToken = "header.eyJzdWIiOiJkaWQ6cHJpdnk6cmV0dXJuaW5nLXVzZXIifQ.signature";
    const ensured: number[] = [];
    const confirmed: string[] = [];
    const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
      createPrivy: async () => ({
        auth: { email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined } },
        initialize: async () => undefined,
        getAccessToken: async () => accessToken,
        ensureEmbeddedEthereumWallet: async index => { ensured.push(index); },
      }),
      exchange: async () => undefined,
      listPersonas: async () => ({ personas: [persona("persona-returning")] }),
      prepareWallet: async () => ({
        persona_id: "persona-returning",
        hd_wallet_index: 2,
        status: "pending",
      }),
      confirmWallet: async (personaId) => {
        confirmed.push(personaId);
        return { hd_wallet_index: 2 };
      },
      idempotencyKey: () => "returning-wallet-key",
      csrf: () => "csrf",
    });

    await expect(auth.loginWithCode("returning@example.test", "123456")).resolves.toBeUndefined();
    expect(ensured).toEqual([2]);
    expect(confirmed).toEqual(["persona-returning"]);
  });

  it("keeps an established session when existing-wallet recovery fails", async () => {
    const recoveryFailure = new ApiClientError(
      { status: 404, code: "not_found", name: "NotFound", retryable: false },
      { error: { code: "not_found", message: "wallet reservation missing", retryable: false } },
    );
    const reportWalletResumeError = vi.fn();
    const dispose = vi.fn();
    const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
      createPrivy: async () => ({
        auth: { email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined } },
        initialize: async () => undefined,
        getAccessToken: async () => "returning-access-token",
        dispose,
      }),
      exchange: async () => undefined,
      listPersonas: async () => ({ personas: [persona("persona-walletless")] }),
      prepareWallet: async () => { throw recoveryFailure; },
      reportWalletResumeError,
      csrf: () => "csrf",
    });

    await expect(auth.loginWithCode("returning@example.test", "123456")).resolves.toBeUndefined();
    expect(reportWalletResumeError).toHaveBeenCalledWith(recoveryFailure, "persona-walletless");
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("does not send a registration assertion for an established account", async () => {
    let exchanges = 0;
    const register = vi.fn(async () => undefined);
    const prepareWallet = vi.fn();
    const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
      createPrivy: async () => ({
        auth: { email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined } },
        initialize: async () => undefined,
        getAccessToken: async () => "returning-access-token",
      }),
      exchange: async () => { exchanges += 1; },
      listPersonas: async () => ({ personas: [persona("persona-returning", {
        chain_account_kind: "evm",
        hd_wallet_index: 2,
        address: "0x0000000000000000000000000000000000000002",
        assigned_at: "2026-09-02T00:00:00.000Z",
      })] }),
      register,
      prepareWallet,
      csrf: () => "csrf",
    });

    await expect(auth.loginWithCode("returning@example.test", "123456")).resolves.toBeUndefined();
    expect(exchanges).toBe(1);
    expect(register).not.toHaveBeenCalled();
    expect(prepareWallet).not.toHaveBeenCalled();
  });

  it("retries a failed wallet creation with the same preparation identity", async () => {
    const accessToken = "header.eyJzdWIiOiJkaWQ6cHJpdnk6dGVzdC11c2VyIn0.signature";
    const unauthorized = new ApiClientError(
      { status: 401, code: "auth_error", name: "AuthError", retryable: false },
      { error: { code: "auth_error", message: "not registered", retryable: false } },
    );
    const preparationKeys: string[] = [];
    let creationAttempts = 0;
    const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
      createPrivy: async () => ({
        auth: { email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined } },
        initialize: async () => undefined,
        getAccessToken: async () => accessToken,
        ensureEmbeddedEthereumWallet: async () => {
          creationAttempts += 1;
          if (creationAttempts === 1) throw new Error("wallet_rejected");
        },
      }),
      exchange: rejectFirstExchange(unauthorized),
      listPersonas: noPersonas,
      register: async () => ({
        status: "wallet_setup_required",
        wallet: {
          persona_id: "persona-1",
          chain_account_kind: "evm",
          hd_wallet_index: 0,
          status: "pending",
          assignment: null,
        },
      }),
      prepareWallet: async (personaId, key) => {
        preparationKeys.push(key);
        return { persona_id: personaId, hd_wallet_index: 0, status: "pending" };
      },
      confirmWallet: async () => ({ hd_wallet_index: 0 }),
      idempotencyKey: () => "stable-wallet-prepare-key",
      csrf: () => "csrf",
    });

    await expect(auth.loginWithCode("person@example.test", "123456")).rejects.toBeInstanceOf(
      PrivyIdentityBootstrapRequired,
    );
    await expect(auth.register(minimumAgeAffirmation)).rejects.toThrow("wallet_rejected");
    await expect(auth.register(minimumAgeAffirmation)).resolves.toBeUndefined();
    expect(preparationKeys).toEqual(["stable-wallet-prepare-key", "stable-wallet-prepare-key"]);
    expect(creationAttempts).toBe(2);
  });

  it("rejects a preparation that changes the server-reserved wallet index", async () => {
    const accessToken = "header.eyJzdWIiOiJkaWQ6cHJpdnk6dGVzdC11c2VyIn0.signature";
    const unauthorized = new ApiClientError(
      { status: 401, code: "auth_error", name: "AuthError", retryable: false },
      { error: { code: "auth_error", message: "not registered", retryable: false } },
    );
    const ensureWallet = vi.fn(async () => undefined);
    const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
      createPrivy: async () => ({
        auth: { email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined } },
        initialize: async () => undefined,
        getAccessToken: async () => accessToken,
        ensureEmbeddedEthereumWallet: ensureWallet,
      }),
      exchange: rejectFirstExchange(unauthorized),
      listPersonas: noPersonas,
      register: async () => ({
        status: "wallet_setup_required",
        wallet: {
          persona_id: "persona-1",
          chain_account_kind: "evm",
          hd_wallet_index: 0,
          status: "pending",
          assignment: null,
        },
      }),
      prepareWallet: async personaId => ({
        persona_id: personaId,
        hd_wallet_index: 1,
        status: "pending",
      }),
      csrf: () => "csrf",
    });

    await expect(auth.loginWithCode("person@example.test", "123456")).rejects.toBeInstanceOf(
      PrivyIdentityBootstrapRequired,
    );
    await expect(auth.register(minimumAgeAffirmation)).rejects.toThrow("wallet_index_mismatch");
    expect(ensureWallet).not.toHaveBeenCalled();
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
        listPersonas: noPersonas,
        register: async () => undefined,
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

  it("canonicalizes a lowercase injected address at both signing boundaries", async () => {
    const request = vi.fn(async ({ method }: { method: string; params?: readonly unknown[] }) => {
      if (method === "eth_requestAccounts") return ["0x43bba97370b00e9930994ea427daee400846617b"];
      if (method === "eth_chainId") return "0x1";
      if (method === "personal_sign") return "0xsignature";
      throw new Error(`unexpected_${method}`);
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { host: "localhost", origin: "http://localhost" }, ethereum: { request } },
    });
    let initializedAddress: string | undefined;
    let authenticatedAddress: string | undefined;
    try {
      const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
        createPrivy: async () => ({
          auth: {
            email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined },
            siwe: {
              init: async wallet => {
                initializedAddress = wallet.address;
                return { message: "sign this message" };
              },
              loginWithSiwe: async (_signature, wallet) => { authenticatedAddress = wallet.address; },
            },
          },
          initialize: async () => undefined,
          getAccessToken: async () => "wallet-access-token",
        }),
        exchange: async () => undefined,
        listPersonas: noPersonas,
        csrf: () => "csrf",
      });

      await auth.loginWithWallet();
      const checksummed = "0x43bbA97370B00E9930994EA427DAEE400846617B";
      expect(initializedAddress).toBe(checksummed);
      const signing = request.mock.calls.find(([{ method }]) => method === "personal_sign");
      expect(signing?.[0].params).toEqual(["sign this message", checksummed]);
      expect(authenticatedAddress).toBe(checksummed);
    } finally {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("fails closed on a malformed injected address before any nonce or signature request", async () => {
    for (const address of ["not-an-address", "0x43bba97370b00e9930994ea427daee400846617"]) {
      const request = vi.fn(async ({ method }: { method: string }) => {
        if (method === "eth_requestAccounts") return [address];
        throw new Error(`unexpected_${method}`);
      });
      const init = vi.fn(async () => ({ message: "sign this message" }));
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: { location: { host: "localhost", origin: "http://localhost" }, ethereum: { request } },
      });
      try {
        const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
          createPrivy: async () => ({
            auth: {
              email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined },
              siwe: { init, loginWithSiwe: async () => undefined },
            },
            initialize: async () => undefined,
            getAccessToken: async () => "wallet-access-token",
          }),
          exchange: async () => undefined,
          csrf: () => "csrf",
        });

        await expect(auth.loginWithWallet()).rejects.toThrow("wallet_auth_failed");
        expect(request.mock.calls).toHaveLength(1);
        expect(request.mock.calls[0][0].method).toBe("eth_requestAccounts");
        expect(init).not.toHaveBeenCalled();
      } finally {
        Reflect.deleteProperty(globalThis, "window");
      }
    }
  });

  it("reports the failing wallet-login stage without replacing its failure", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return ["0x0000000000000000000000000000000000000001"];
      if (method === "eth_chainId") return "0x1";
      throw new Error(`unexpected_${method}`);
    });
    const reportWalletLoginStage = vi.fn();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { host: "localhost", origin: "http://localhost" }, ethereum: { request } },
    });
    try {
      const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
        createPrivy: async () => ({
          auth: {
            email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined },
            siwe: {
              init: async () => { throw new Error("privy_invalid_siwe"); },
              loginWithSiwe: async () => undefined,
            },
          },
          initialize: async () => undefined,
          getAccessToken: async () => "wallet-access-token",
        }),
        exchange: async () => undefined,
        csrf: () => "csrf",
        reportWalletLoginStage,
      });

      await expect(auth.loginWithWallet()).rejects.toThrow("privy_invalid_siwe");
      expect(reportWalletLoginStage).toHaveBeenCalledTimes(1);
      expect(reportWalletLoginStage).toHaveBeenCalledWith("siwe_init", expect.any(Error));
    } finally {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("records the Privy transport status when SIWE authentication is rejected", async () => {
    // Privy rejects a nonconforming SIWE message with its own error class, not
    // with the Pirate api-next client error. The default reporter must still
    // capture the status, or the exact failure this path exists to explain
    // would be logged as `undefined`.
    class PrivySiweRejection extends Error {
      readonly status = 422;
      readonly code = "invalid_data";
      constructor() {
        super("Invalid SIWE message and/or signature");
        this.name = "PrivyApiError";
      }
    }
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return ["0x0000000000000000000000000000000000000001"];
      if (method === "eth_chainId") return "0x1";
      if (method === "personal_sign") return "0xsignature";
      throw new Error(`unexpected_${method}`);
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { host: "localhost", origin: "http://localhost" }, ethereum: { request } },
    });
    try {
      const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
        createPrivy: async () => ({
          auth: {
            email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined },
            siwe: {
              init: async () => ({ message: "localhost wants you to sign in..." }),
              loginWithSiwe: async () => { throw new PrivySiweRejection(); },
            },
          },
          initialize: async () => undefined,
          getAccessToken: async () => "wallet-access-token",
        }),
        exchange: async () => undefined,
        csrf: () => "csrf",
      });

      await expect(auth.loginWithWallet()).rejects.toThrow("Invalid SIWE message and/or signature");
      expect(warn).toHaveBeenCalledWith("wallet_login_stage_failed", {
        stage: "siwe_authenticate",
        status: 422,
        code: "invalid_data",
      });
    } finally {
      warn.mockRestore();
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("keeps an unclassified wallet-login failure to its stage marker alone", async () => {
    // A plain provider or network error carries no status. The marker must
    // still localize the stage without inventing transport detail.
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return ["0x0000000000000000000000000000000000000001"];
      if (method === "eth_chainId") return "0x1";
      throw new Error(`unexpected_${method}`);
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { host: "localhost", origin: "http://localhost" }, ethereum: { request } },
    });
    try {
      const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
        createPrivy: async () => ({
          auth: {
            email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined },
            siwe: {
              init: async () => { throw new Error("network_down"); },
              loginWithSiwe: async () => undefined,
            },
          },
          initialize: async () => undefined,
          getAccessToken: async () => "wallet-access-token",
        }),
        exchange: async () => undefined,
        csrf: () => "csrf",
      });

      await expect(auth.loginWithWallet()).rejects.toThrow("network_down");
      expect(warn).toHaveBeenCalledWith("wallet_login_stage_failed", { stage: "siwe_init" });
    } finally {
      warn.mockRestore();
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("fails closed when no injected wallet is present", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { host: "localhost", origin: "http://localhost" } },
    });
    try {
      const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
        createPrivy: async () => ({
          auth: {
            email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined },
            siwe: {
              init: async () => ({ message: "sign this message" }),
              loginWithSiwe: async () => undefined,
            },
          },
          initialize: async () => undefined,
          getAccessToken: async () => "wallet-access-token",
        }),
        exchange: async () => undefined,
        csrf: () => "csrf",
      });

      await expect(auth.loginWithWallet()).rejects.toThrow("wallet_unavailable");
    } finally {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("normalizes an injected-wallet signature rejection", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return ["0x0000000000000000000000000000000000000001"];
      if (method === "eth_chainId") return "0x1";
      if (method === "personal_sign") throw new Error("provider detail must stay private");
      throw new Error(`unexpected_${method}`);
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { host: "localhost", origin: "http://localhost" }, ethereum: { request } },
    });
    try {
      const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
        createPrivy: async () => ({
          auth: {
            email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined },
            siwe: {
              init: async () => ({ message: "sign this message" }),
              loginWithSiwe: async () => undefined,
            },
          },
          initialize: async () => undefined,
          getAccessToken: async () => "wallet-access-token",
        }),
        exchange: async () => undefined,
        csrf: () => "csrf",
      });

      await expect(auth.loginWithWallet()).rejects.toThrow("wallet_auth_failed");
    } finally {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("distinguishes an injected-wallet cancellation", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") {
        throw Object.assign(new Error("provider detail must stay private"), { code: 4001 });
      }
      throw new Error(`unexpected_${method}`);
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { host: "localhost", origin: "http://localhost" }, ethereum: { request } },
    });
    try {
      const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
        createPrivy: async () => ({
          auth: {
            email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined },
            siwe: {
              init: async () => ({ message: "sign this message" }),
              loginWithSiwe: async () => undefined,
            },
          },
          initialize: async () => undefined,
          getAccessToken: async () => "wallet-access-token",
        }),
        exchange: async () => undefined,
        csrf: () => "csrf",
      });

      await expect(auth.loginWithWallet()).rejects.toThrow("wallet_auth_rejected");
    } finally {
      Reflect.deleteProperty(globalThis, "window");
    }
  });

  it("preserves a Privy SIWE infrastructure failure", async () => {
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") return ["0x0000000000000000000000000000000000000001"];
      if (method === "eth_chainId") return "0x1";
      throw new Error(`unexpected_${method}`);
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { host: "localhost", origin: "http://localhost" }, ethereum: { request } },
    });
    try {
      const auth = await createPrivySessionExchange({ enabled: true, privyAppId: "app" }, {
        createPrivy: async () => ({
          auth: {
            email: { sendCode: async () => ({ success: true }), loginWithCode: async () => undefined },
            siwe: {
              init: async () => { throw new Error("privy_origin_configuration_failed"); },
              loginWithSiwe: async () => undefined,
            },
          },
          initialize: async () => undefined,
          getAccessToken: async () => "wallet-access-token",
        }),
        exchange: async () => undefined,
        csrf: () => "csrf",
      });

      await expect(auth.loginWithWallet()).rejects.toThrow("privy_origin_configuration_failed");
    } finally {
      Reflect.deleteProperty(globalThis, "window");
    }
  });
});
