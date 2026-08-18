import type { Storage } from "@privy-io/js-sdk-core";
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
  getIdentityToken(): Promise<string | null>;
}

type PrivyFactory = (config: VerificationPublicConfig, storage: Storage) => Promise<PrivyAuthClient>;

interface PrivyAccessTokenProof {
  type: "privy_access_token";
  privy_access_token: string;
  privy_identity_token?: string;
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
    getIdentityToken: () => client.getIdentityToken(),
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
      const identityToken = await client.getIdentityToken();
      if (accessToken === null || accessToken.length === 0) throw new Error("auth_failed");
      try {
        await exchange(accessToken, identityToken ?? undefined);
        terminal = true;
      } finally {
        storage.clear();
      }
      if ((dependencies.csrf ?? readCsrfCookie)() === undefined) throw new Error("session_failed");
    },
    clear() { terminal = true; storage.clear(); },
  };
}
