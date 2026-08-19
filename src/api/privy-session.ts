import type { ExternalWallet, Storage } from "@privy-io/js-sdk-core";
import { ApiClientError } from "@pirate/api-client";
import { createSessionApiClient, readCsrfCookie } from "./client.ts";
import type { VerificationPublicConfig } from "./verification-config.ts";

export class MemoryOnlyStorage implements Storage {
  readonly #values = new Map<string, unknown>();
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- Privy's Storage ABI requires unknown.
  get(key: string): unknown { return this.#values.get(key); }
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Privy's Storage ABI requires unknown.
  put(key: string, value: unknown): void { this.#values.set(key, value); }
  del(key: string): void { this.#values.delete(key); }
  getKeys(): string[] { return [...this.#values.keys()]; }
  clear(): void { this.#values.clear(); }
}

interface PrivyAuthClient {
  readonly auth: { readonly email: {
    sendCode(email: string): Promise<{ success: boolean }>;
    loginWithCode(email: string, code: string): Promise<void>;
  }; readonly oauth?: {
    generateURL(provider: OAuthProvider, redirectURI: string): Promise<{ url: string }>;
    loginWithCode(authorizationCode: string, returnedStateCode: string, provider: OAuthProvider): Promise<void>;
  }; readonly siwe?: {
    init(wallet: ExternalWallet, domain: string, uri: string): Promise<{ message: string }>;
    loginWithSiwe(signature: string, wallet: ExternalWallet, message: string): Promise<void>;
  } };
  initialize(): Promise<void>;
  getAccessToken(): Promise<string | null>;
}

type PrivyFactory = (config: VerificationPublicConfig, storage: Storage) => Promise<PrivyAuthClient>;

interface PrivyAccessTokenProof {
  type: "privy_access_token";
  privy_access_token: string;
  privy_identity_token?: string;
}

export class PrivyIdentityBootstrapRequired extends Error {
  constructor(readonly sourceUserId: string) {
    super("identity_bootstrap_required");
    this.name = "PrivyIdentityBootstrapRequired";
  }
}

function accessTokenSubject(token: string): string | undefined {
  try {
    const payload = token.split(".")[1];
    if (payload === undefined) return undefined;
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
    const decoded: unknown = JSON.parse(
      atob(`${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`),
    );
    if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) return undefined;
    // SAFETY: the object boundary above is checked before reading the optional dynamic claim.
    const subject = (decoded as { readonly sub?: unknown }).sub;
    return typeof subject === "string" && /^did:privy:[A-Za-z0-9._:-]+$/u.test(subject)
      ? subject
      : undefined;
  } catch {
    return undefined;
  }
}

async function defaultPrivyFactory(config: VerificationPublicConfig, storage: Storage): Promise<PrivyAuthClient> {
  if (typeof window === "undefined") throw new Error("browser_required");
  const { default: Privy } = await import("@privy-io/js-sdk-core");
  const client = new Privy({ appId: config.privyAppId, clientId: config.privyClientId, storage });
  return {
    auth: { email: {
      sendCode: email => client.auth.email.sendCode(email),
      loginWithCode: async (email, code) => { await client.auth.email.loginWithCode(email, code); },
    }, oauth: {
      generateURL: (provider, redirectURI) => client.auth.oauth.generateURL(provider, redirectURI),
      loginWithCode: async (authorizationCode, returnedStateCode, provider) => {
        await client.auth.oauth.loginWithCode(authorizationCode, returnedStateCode, provider);
      },
    }, siwe: {
      init: (wallet, domain, uri) => client.auth.siwe.init(wallet, domain, uri),
      loginWithSiwe: async (signature, wallet, message) => {
        await client.auth.siwe.loginWithSiwe(signature, wallet, message);
      },
    } },
    initialize: () => client.initialize(),
    getAccessToken: () => client.getAccessToken(),
  };
}

export interface PrivySessionExchange {
  sendCode(email: string): Promise<void>;
  loginWithCode(email: string, code: string): Promise<void>;
  beginOAuth(provider: OAuthProvider, redirectURI: string): Promise<string>;
  completeOAuth(provider: OAuthProvider, authorizationCode: string, returnedStateCode: string): Promise<void>;
  loginWithWallet(): Promise<void>;
  /** Complete first-time account provisioning after an exchange 401. */
  register(): Promise<void>;
  clear(): void;
}

export type OAuthProvider = "google" | "twitter";

interface EthereumProvider {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
}

function browserEthereumProvider(): EthereumProvider {
  if (typeof window === "undefined") throw new Error("browser_required");
  const candidate = (window as Window & { ethereum?: unknown }).ethereum;
  if (candidate === null || typeof candidate !== "object" || !("request" in candidate)) {
    throw new Error("wallet_unavailable");
  }
  const request = (candidate as { request?: unknown }).request;
  if (typeof request !== "function") throw new Error("wallet_unavailable");
  return candidate as EthereumProvider;
}

function stringValue(value: unknown, failure: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(failure);
  return value;
}

function chainId(value: unknown): string {
  const raw = stringValue(value, "wallet_unavailable");
  const numeric = Number.parseInt(raw, raw.startsWith("0x") ? 16 : 10);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) throw new Error("wallet_unavailable");
  return `eip155:${numeric}`;
}

export async function createPrivySessionExchange(
  config: VerificationPublicConfig,
  dependencies: {
    readonly createPrivy?: PrivyFactory;
    readonly exchange?: (accessToken: string, identityToken?: string) => Promise<void>;
    readonly register?: (accessToken: string) => Promise<void>;
    readonly csrf?: () => string | undefined;
  } = {},
): Promise<PrivySessionExchange> {
  const storage = new MemoryOnlyStorage();
  const client = await (dependencies.createPrivy ?? defaultPrivyFactory)(config, storage);
  await client.initialize();
  let terminal = false;
  let pendingRegistrationToken: string | undefined;
  const exchange = dependencies.exchange ?? (async (accessToken, identityToken) => {
    const proof: PrivyAccessTokenProof = {
        type: "privy_access_token",
        privy_access_token: accessToken,
    };
    if (identityToken !== undefined) proof.privy_identity_token = identityToken;
    await createSessionApiClient().post_authSessionExchange({ body: { proof } });
  });
  const register = dependencies.register ?? (async (accessToken: string) => {
    await createSessionApiClient().post_authRegister({ body: { privy_access_token: accessToken } });
  });
  const establishSession = async () => {
    const accessToken = await client.getAccessToken();
    if (accessToken === null || accessToken.length === 0) throw new Error("auth_failed");
    try {
      await exchange(accessToken);
      terminal = true;
    } catch (error) {
      const sourceUserId = accessTokenSubject(accessToken);
      if (error instanceof ApiClientError && error.status === 401 && sourceUserId !== undefined) {
        pendingRegistrationToken = accessToken;
        throw new PrivyIdentityBootstrapRequired(sourceUserId);
      }
      throw error;
    } finally {
      storage.clear();
    }
    if ((dependencies.csrf ?? readCsrfCookie)() === undefined) throw new Error("session_failed");
  };
  return {
    async sendCode(email) {
      if (terminal) throw new Error("auth_expired");
      const result = await client.auth.email.sendCode(email);
      if (!result.success) throw new Error("auth_failed");
    },
    async loginWithCode(email, code) {
      if (terminal) throw new Error("auth_expired");
      await client.auth.email.loginWithCode(email, code);
      await establishSession();
    },
    async beginOAuth(provider, redirectURI) {
      if (terminal) throw new Error("auth_expired");
      const oauth = client.auth.oauth;
      if (oauth === undefined) throw new Error("oauth_unavailable");
      const response = await oauth.generateURL(provider, redirectURI);
      return stringValue(response.url, "oauth_unavailable");
    },
    async completeOAuth(provider, authorizationCode, returnedStateCode) {
      if (terminal) throw new Error("auth_expired");
      const oauth = client.auth.oauth;
      if (oauth === undefined) throw new Error("oauth_unavailable");
      await oauth.loginWithCode(
        stringValue(authorizationCode, "auth_failed"),
        stringValue(returnedStateCode, "auth_failed"),
        provider,
      );
      await establishSession();
    },
    async loginWithWallet() {
      if (terminal) throw new Error("auth_expired");
      const siwe = client.auth.siwe;
      if (siwe === undefined) throw new Error("wallet_unavailable");
      const provider = browserEthereumProvider();
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      if (!Array.isArray(accounts) || accounts.length === 0) throw new Error("wallet_unavailable");
      const address = stringValue(accounts[0], "wallet_unavailable");
      const wallet: ExternalWallet = {
        address,
        chainId: chainId(await provider.request({ method: "eth_chainId" })),
        connectorType: "injected",
      };
      const initialized = await siwe.init(wallet, window.location.host, window.location.origin);
      const signature = stringValue(
        await provider.request({ method: "personal_sign", params: [initialized.message, address] }),
        "wallet_auth_failed",
      );
      await siwe.loginWithSiwe(signature, wallet, initialized.message);
      await establishSession();
    },
    async register() {
      if (terminal) throw new Error("auth_expired");
      const accessToken = pendingRegistrationToken;
      if (accessToken === undefined) throw new Error("registration_unavailable");
      await register(accessToken);
      pendingRegistrationToken = undefined;
      terminal = true;
      if ((dependencies.csrf ?? readCsrfCookie)() === undefined) throw new Error("session_failed");
    },
    clear() { terminal = true; pendingRegistrationToken = undefined; storage.clear(); },
  };
}
