import type { Storage } from "@privy-io/js-sdk-core";
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
    } },
    initialize: () => client.initialize(),
    getAccessToken: () => client.getAccessToken(),
  };
}

export interface PrivySessionExchange {
  sendCode(email: string): Promise<void>;
  loginWithCode(email: string, code: string): Promise<void>;
  clear(): void;
}

export async function createPrivySessionExchange(
  config: VerificationPublicConfig,
  dependencies: {
    readonly createPrivy?: PrivyFactory;
    readonly exchange?: (accessToken: string, identityToken?: string) => Promise<void>;
    readonly csrf?: () => string | undefined;
  } = {},
): Promise<PrivySessionExchange> {
  const storage = new MemoryOnlyStorage();
  const client = await (dependencies.createPrivy ?? defaultPrivyFactory)(config, storage);
  await client.initialize();
  let terminal = false;
  const exchange = dependencies.exchange ?? (async (accessToken, identityToken) => {
    const proof: PrivyAccessTokenProof = {
        type: "privy_access_token",
        privy_access_token: accessToken,
    };
    if (identityToken !== undefined) proof.privy_identity_token = identityToken;
    await createSessionApiClient().post_authSessionExchange({ body: { proof } });
  });
  return {
    async sendCode(email) {
      if (terminal) throw new Error("auth_expired");
      const result = await client.auth.email.sendCode(email);
      if (!result.success) throw new Error("auth_failed");
    },
    async loginWithCode(email, code) {
      if (terminal) throw new Error("auth_expired");
      await client.auth.email.loginWithCode(email, code);
      const accessToken = await client.getAccessToken();
      if (accessToken === null || accessToken.length === 0) throw new Error("auth_failed");
      try {
        await exchange(accessToken);
        terminal = true;
      } catch (error) {
        const sourceUserId = accessTokenSubject(accessToken);
        if (error instanceof ApiClientError && error.status === 401 && sourceUserId !== undefined) {
          throw new PrivyIdentityBootstrapRequired(sourceUserId);
        }
        throw error;
      } finally {
        storage.clear();
      }
      if ((dependencies.csrf ?? readCsrfCookie)() === undefined) throw new Error("session_failed");
    },
    clear() { terminal = true; storage.clear(); },
  };
}
