import type { ExternalWallet, Storage } from "@privy-io/js-sdk-core";
import { ApiClientError, type PostAuthRegisterResponse } from "@pirate/api-client";
import { createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "./client.ts";
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
  ensureEmbeddedEthereumWallet?(walletIndex: number, idempotencyKey: string): Promise<void>;
  dispose?(): void;
}

type PrivyFactory = (config: VerificationPublicConfig, storage: Storage) => Promise<PrivyAuthClient>;

type PrivySdk = typeof import("@privy-io/js-sdk-core");

let privySdkPromise: Promise<PrivySdk> | undefined;

/**
 * Starts the browser-only Privy chunk before the sign-in surface needs it.
 * The module loader already caches successful imports; retaining the promise
 * also coalesces concurrent intent signals and permits a retry after failure.
 */
export function preloadPrivySdk(): Promise<PrivySdk> {
  const existing = privySdkPromise;
  if (existing !== undefined) return existing;
  const pending = import("@privy-io/js-sdk-core");
  privySdkPromise = pending;
  void pending.catch(() => {
    if (privySdkPromise === pending) privySdkPromise = undefined;
  });
  return pending;
}

interface PrivyAccessTokenProof {
  type: "privy_access_token";
  privy_access_token: string;
  privy_identity_token?: string;
}

interface MinimumAgeRegistrationBody {
  readonly privy_access_token: string;
  readonly minimum_age_attestation: Readonly<{
    version: "minimum-age-attestation-v1";
    minimum_age: 16;
    affirmed: true;
  }>;
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
  const {
    default: Privy,
    getAllUserEmbeddedEthereumWallets,
    getEntropyDetailsFromAccount,
  } = await preloadPrivySdk();
  const client = new Privy({ appId: config.privyAppId, clientId: config.privyClientId, storage });
  let embeddedWalletFrame: HTMLIFrameElement | undefined;
  let embeddedWalletListener: ((event: MessageEvent) => void) | undefined;
  const ensureEmbeddedWalletBridge = () => {
    if (embeddedWalletFrame !== undefined) return;
    const frame = document.createElement("iframe");
    frame.src = client.embeddedWallet.getURL();
    const embeddedWalletOrigin = new URL(frame.src).origin;
    frame.style.display = "none";
    frame.setAttribute("aria-hidden", "true");
    document.documentElement.appendChild(frame);
    const target = frame.contentWindow;
    if (target === null) {
      frame.parentNode?.removeChild(frame);
      throw new Error("wallet_creation_unavailable");
    }
    client.setMessagePoster({
      postMessage: (message, targetOrigin, transfer) => {
        target.postMessage(message, targetOrigin, transfer === undefined ? undefined : [transfer]);
      },
      reload: () => { target.location.reload(); },
    });
    const listener = (event: MessageEvent) => {
      if (event.source !== target || event.origin !== embeddedWalletOrigin) return;
      try {
        const payload: unknown = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        // SAFETY: only messages from Privy's exact iframe window reach this branch;
        // the SDK validates the response event before settling a wallet request.
        client.embeddedWallet.onMessage(
          payload as Parameters<typeof client.embeddedWallet.onMessage>[0],
        );
      } catch {
        // Ignore malformed cross-window data; Privy's typed responses settle the active request.
      }
    };
    window.addEventListener("message", listener);
    embeddedWalletFrame = frame;
    embeddedWalletListener = listener;
  };
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
    async ensureEmbeddedEthereumWallet(walletIndex, idempotencyKey) {
      ensureEmbeddedWalletBridge();
      let { user } = await client.user.get();
      let wallets = getAllUserEmbeddedEthereumWallets(user);
      if (wallets.some((wallet) => wallet.wallet_index === walletIndex)) return;

      if (walletIndex === 0) {
        await client.embeddedWallet.create({
          idempotencyKey,
        });
      } else {
        const root = wallets.find((wallet) => wallet.wallet_index === 0);
        if (root === undefined) throw new Error("wallet_index_unavailable");
        const entropy = getEntropyDetailsFromAccount(root);
        await client.embeddedWallet.add({
          chainType: "ethereum",
          hdWalletIndex: walletIndex,
          ...entropy,
        });
      }

      ({ user } = await client.user.get());
      wallets = getAllUserEmbeddedEthereumWallets(user);
      if (!wallets.some((wallet) => wallet.wallet_index === walletIndex)) {
        throw new Error("wallet_index_mismatch");
      }
    },
    dispose() {
      if (embeddedWalletListener !== undefined) {
        window.removeEventListener("message", embeddedWalletListener);
      }
      embeddedWalletFrame?.parentNode?.removeChild(embeddedWalletFrame);
      embeddedWalletListener = undefined;
      embeddedWalletFrame = undefined;
    },
  };
}

type RegistrationResult = PostAuthRegisterResponse;

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
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- EIP-1193 providers return protocol-specific JSON-RPC values.
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
}

function ethereumProviderErrorCode(error: unknown): number | undefined {
  if (error === null || typeof error !== "object" || !("code" in error)) return undefined;
  // SAFETY: the property is read only after the object and property-existence checks above.
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "number" ? code : undefined;
}

async function requestEthereumProvider<Result>(
  provider: EthereumProvider,
  args: { readonly method: string; readonly params?: readonly unknown[] },
  failure: "wallet_unavailable" | "wallet_auth_failed",
  parse: (value: unknown) => Result,
): Promise<Result> {
  try {
    return parse(await provider.request(args));
  } catch (error) {
    if (error instanceof Error && error.message === "wallet_unavailable") throw error;
    const message = ethereumProviderErrorCode(error) === 4001 ? "wallet_auth_rejected" : failure;
    throw new Error(message, { cause: error });
  }
}

function isEthereumProvider(candidate: unknown): candidate is EthereumProvider {
  if (candidate === null || typeof candidate !== "object" || !("request" in candidate)) {
    return false;
  }
  // SAFETY: candidate is narrowed to an object with a request property above.
  return typeof (candidate as { request?: unknown }).request === "function";
}

/**
 * Reports whether the browser currently exposes an injected EIP-1193 wallet.
 * This is a presentation guard, not authority: the provider is validated again
 * when the user starts SIWE so disappearance between render and click fails
 * closed.
 */
export function hasInjectedEthereumProvider(): boolean {
  if (typeof window === "undefined") return false;
  // SAFETY: browser globals are inspected before narrowing the optional property.
  return isEthereumProvider((window as Window & { ethereum?: unknown }).ethereum);
}

function browserEthereumProvider(): EthereumProvider {
  if (typeof window === "undefined") throw new Error("browser_required");
  // SAFETY: browser globals are inspected before narrowing to the optional ethereum property.
  const candidate = (window as Window & { ethereum?: unknown }).ethereum;
  if (!isEthereumProvider(candidate)) throw new Error("wallet_unavailable");
  return candidate;
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

function walletAddress(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) throw new Error("wallet_unavailable");
  return stringValue(value[0], "wallet_unavailable");
}

function walletSignature(value: unknown): string {
  return stringValue(value, "wallet_auth_failed");
}

export async function createPrivySessionExchange(
  config: VerificationPublicConfig,
  dependencies: {
    readonly createPrivy?: PrivyFactory;
    readonly exchange?: (accessToken: string, identityToken?: string) => Promise<void>;
    readonly register?: (accessToken: string) => Promise<RegistrationResult | void>;
    readonly prepareWallet?: (personaId: string, idempotencyKey: string) => Promise<{
      readonly persona_id: string;
      readonly hd_wallet_index: number;
      readonly status: "pending" | "active";
    }>;
    readonly confirmWallet?: (personaId: string, accessToken: string) => Promise<{
      readonly hd_wallet_index: number;
    }>;
    readonly csrf?: () => string | undefined;
    readonly idempotencyKey?: () => string;
  } = {},
): Promise<PrivySessionExchange> {
  const storage = new MemoryOnlyStorage();
  const client = await (dependencies.createPrivy ?? defaultPrivyFactory)(config, storage);
  await client.initialize();
  let terminal = false;
  let pendingRegistrationToken: string | undefined;
  let walletPreparationKey: string | undefined;
  const exchange = dependencies.exchange ?? (async (accessToken, identityToken) => {
    const proof: PrivyAccessTokenProof = {
        type: "privy_access_token",
        privy_access_token: accessToken,
    };
    if (identityToken !== undefined) proof.privy_identity_token = identityToken;
    await createSessionApiClient().post_authSessionExchange({ body: { proof } });
  });
  const register = dependencies.register ?? (async (accessToken: string): Promise<RegistrationResult> => {
    const body = {
      privy_access_token: accessToken,
      minimum_age_attestation: {
        version: "minimum-age-attestation-v1",
        minimum_age: 16,
        affirmed: true,
      },
    } satisfies MinimumAgeRegistrationBody;
    return createSessionApiClient().post_authRegister({
      body,
    });
  });
  const prepareWallet = dependencies.prepareWallet ?? (async (personaId, idempotencyKey) => {
    const csrf = readCsrfCookie();
    if (csrf === undefined) throw new Error("session_failed");
    return createSessionApiClient().post_personasPersonaIdWalletsEvmPrepare({
      body: { idempotency_key: idempotencyKey },
      path: { personaId },
    }, sessionRequestOptions(csrf));
  });
  const confirmWallet = dependencies.confirmWallet ?? (async (personaId, accessToken) => {
    const csrf = readCsrfCookie();
    if (csrf === undefined) throw new Error("session_failed");
    return createSessionApiClient().post_personasPersonaIdWalletsEvmConfirm({
      body: { proof: { type: "privy_access_token", privy_access_token: accessToken } },
      path: { personaId },
    }, sessionRequestOptions(csrf));
  });
  const completeWalletSetup = async (
    accessToken: string,
    registration: RegistrationResult | void,
  ) => {
    if (
      registration === undefined ||
      !("status" in registration) ||
      registration.status !== "wallet_setup_required"
    ) return;

    pendingRegistrationToken = accessToken;
    if ((dependencies.csrf ?? readCsrfCookie)() === undefined) throw new Error("session_failed");
    walletPreparationKey ??= (dependencies.idempotencyKey ?? (() => crypto.randomUUID()))();
    const prepared = await prepareWallet(registration.wallet.persona_id, walletPreparationKey);
    if (
      prepared.persona_id !== registration.wallet.persona_id ||
      prepared.hd_wallet_index !== registration.wallet.hd_wallet_index
    ) {
      throw new Error("wallet_index_mismatch");
    }
    if (prepared.status === "active") return;

    const ensureWallet = client.ensureEmbeddedEthereumWallet;
    if (ensureWallet === undefined) throw new Error("wallet_creation_unavailable");
    await ensureWallet(prepared.hd_wallet_index, walletPreparationKey);
    const currentAccessToken = await client.getAccessToken();
    if (currentAccessToken === null || currentAccessToken.length === 0) {
      throw new Error("auth_failed");
    }
    const confirmed = await confirmWallet(prepared.persona_id, currentAccessToken);
    if (confirmed.hd_wallet_index !== prepared.hd_wallet_index) {
      throw new Error("wallet_index_mismatch");
    }
  };
  const registrationForEstablishedSession = async (accessToken: string) => {
    try {
      return await register(accessToken);
    } catch (error) {
      // A successful exchange already proved this Privy subject owns an
      // existing Pirate account. Registration remains necessary to resume an
      // interrupted wallet bootstrap, but an active account answers conflict
      // because there is no bootstrap left to perform.
      if (error instanceof ApiClientError && error.status === 409) return undefined;
      throw error;
    }
  };
  const finishSession = () => {
    if ((dependencies.csrf ?? readCsrfCookie)() === undefined) throw new Error("session_failed");
    pendingRegistrationToken = undefined;
    walletPreparationKey = undefined;
    terminal = true;
    storage.clear();
    client.dispose?.();
  };
  const establishSession = async () => {
    const accessToken = await client.getAccessToken();
    if (accessToken === null || accessToken.length === 0) throw new Error("auth_failed");
    const sourceUserId = accessTokenSubject(accessToken);
    try {
      await exchange(accessToken);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401 && sourceUserId !== undefined) {
        pendingRegistrationToken = accessToken;
        throw new PrivyIdentityBootstrapRequired(sourceUserId);
      }
      storage.clear();
      throw error;
    }
    try {
      await completeWalletSetup(accessToken, await registrationForEstablishedSession(accessToken));
      finishSession();
    } catch (error) {
      if (pendingRegistrationToken !== undefined && sourceUserId !== undefined) {
        throw new PrivyIdentityBootstrapRequired(sourceUserId);
      }
      storage.clear();
      client.dispose?.();
      throw error;
    }
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
      const address = await requestEthereumProvider(
        provider,
        { method: "eth_requestAccounts" },
        "wallet_auth_failed",
        walletAddress,
      );
      const wallet: ExternalWallet = {
        address,
        chainId: await requestEthereumProvider(provider, { method: "eth_chainId" }, "wallet_unavailable", chainId),
        connectorType: "injected",
      };
      const initialized = await siwe.init(wallet, window.location.host, window.location.origin);
      const signature = await requestEthereumProvider(
        provider,
        { method: "personal_sign", params: [initialized.message, address] },
        "wallet_auth_failed",
        walletSignature,
      );
      await siwe.loginWithSiwe(signature, wallet, initialized.message);
      await establishSession();
    },
    async register() {
      if (terminal) throw new Error("auth_expired");
      const accessToken = pendingRegistrationToken;
      if (accessToken === undefined) throw new Error("registration_unavailable");
      await completeWalletSetup(accessToken, await register(accessToken));
      // Wallet confirmation makes the persona product-ready. Replace the
      // narrow setup session with the ordinary application session only after
      // that durable transition succeeds.
      await exchange(accessToken);
      finishSession();
    },
    clear() {
      terminal = true;
      pendingRegistrationToken = undefined;
      walletPreparationKey = undefined;
      storage.clear();
      client.dispose?.();
    },
  };
}
