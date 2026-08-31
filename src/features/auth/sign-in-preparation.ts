import {
  createPrivySessionExchange,
  preloadPrivySdk,
  type PrivySessionExchange,
} from "../../api/privy-session.ts";
import {
  fetchVerificationConfig,
  type VerificationPublicConfig,
} from "../../api/verification-config.ts";

const PREPARED_EXCHANGE_LIFETIME_MS = 30_000;

interface PreparedExchange {
  readonly promise: Promise<PrivySessionExchange>;
  readonly timeout: ReturnType<typeof setTimeout>;
}

export interface SignInPreparationOptions {
  readonly createExchange?: (config: VerificationPublicConfig) => Promise<PrivySessionExchange>;
  readonly fetchConfig?: () => Promise<VerificationPublicConfig>;
  readonly lifetimeMs?: number;
  readonly preloadSdk?: () => Promise<void>;
}

export interface SignInPreparation {
  /** Warms same-origin config and SDK assets without creating a Privy client. */
  preload(): void;
  /**
   * Initializes a memory-only exchange without surfacing a rejected promise to
   * an event handler. Production callers use focus or pointer-down.
   */
  prepare(): void;
  /** Adopts the intent-prepared exchange, or builds one when no intent ran first. */
  acquire(): Promise<PrivySessionExchange>;
}

/**
 * Owns one page-local sign-in warmup slot. Public config and the Privy module
 * are safe to memoize for the lifetime of the page. An initialized exchange is
 * memory-only and intentionally shorter lived: the first modal to open adopts
 * it, while an unused intent is cleared after a bounded interval.
 */
export function createSignInPreparation(
  options: SignInPreparationOptions = {},
): SignInPreparation {
  const createExchange = options.createExchange ?? createPrivySessionExchange;
  const fetchConfig = options.fetchConfig ?? fetchVerificationConfig;
  const loadSdk = options.preloadSdk ?? (async () => { await preloadPrivySdk(); });
  const lifetimeMs = options.lifetimeMs ?? PREPARED_EXCHANGE_LIFETIME_MS;
  let configPromise: Promise<VerificationPublicConfig> | undefined;
  let sdkPromise: Promise<void> | undefined;
  let prepared: PreparedExchange | undefined;

  const config = (): Promise<VerificationPublicConfig> => {
    const existing = configPromise;
    if (existing !== undefined) return existing;
    const pending = fetchConfig();
    configPromise = pending;
    void pending.catch(() => {
      if (configPromise === pending) configPromise = undefined;
    });
    return pending;
  };

  const sdk = (): Promise<void> => {
    const existing = sdkPromise;
    if (existing !== undefined) return existing;
    const pending = loadSdk();
    sdkPromise = pending;
    void pending.catch(() => {
      if (sdkPromise === pending) sdkPromise = undefined;
    });
    return pending;
  };

  const assets = async (): Promise<VerificationPublicConfig> => {
    const [verificationConfig] = await Promise.all([config(), sdk()]);
    return verificationConfig;
  };

  const build = async (): Promise<PrivySessionExchange> => {
    return createExchange(await assets());
  };

  const start = (): PreparedExchange => {
    const promise = build();
    let entry!: PreparedExchange;
    const timeout = setTimeout(() => {
      if (prepared !== entry) return;
      prepared = undefined;
      void promise.then((exchange) => exchange.clear(), () => undefined);
    }, lifetimeMs);
    entry = { promise, timeout };
    prepared = entry;
    void promise.catch(() => {
      if (prepared !== entry) return;
      clearTimeout(timeout);
      prepared = undefined;
    });
    return entry;
  };

  return {
    preload() {
      void assets().catch(() => undefined);
    },
    prepare() {
      prepared ??= start();
    },
    acquire() {
      const entry = prepared ?? start();
      prepared = undefined;
      clearTimeout(entry.timeout);
      return entry.promise;
    },
  };
}

const defaultSignInPreparation = createSignInPreparation();

export function preloadSignInAssets(): void {
  if (globalThis.window !== undefined) defaultSignInPreparation.preload();
}

export function prepareSignIn(): void {
  if (globalThis.window !== undefined) defaultSignInPreparation.prepare();
}

export function acquireSignInExchange(): Promise<PrivySessionExchange> {
  return defaultSignInPreparation.acquire();
}
