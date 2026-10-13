import { MemoryOnlyStorage, preloadPrivySdk } from "../../../api/privy-session.ts";
import { privyAccessTokenSubject } from "../../../api/privy-wallet-authorization.ts";
import { fetchVerificationConfig, type VerificationPublicConfig } from "../../../api/verification-config.ts";
import type { Storage as PrivyStorage } from "@privy-io/js-sdk-core";
import { TELEGRAM_PROBE_APP_ID, TELEGRAM_PROBE_ORIGIN, TELEGRAM_PROBE_CALLBACK_PATH, telegramProbeEnabled } from "./telegram-identity-probe-config.ts";

const CONTINUATION_KEY = "pirate:telegram-login-probe:v1";
const ATTEMPT_LIFETIME_MS = 5 * 60_000;
export type ProbeTabStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
interface ProbeContinuation { readonly version: 1; readonly appId: string; readonly state: string; readonly verifier: string; readonly startedAt: number }
export interface ProbeCallback { readonly code: string; readonly state: string }
export interface ProbeObservation { readonly startedAt: string; readonly returnedAt: string; readonly providerSubjectFingerprint: string }

function scalar(value: unknown, maximum: number): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= maximum ? value : undefined;
}

export function takeProbeCallback(url: URL): ProbeCallback | undefined {
  if (url.origin !== TELEGRAM_PROBE_ORIGIN || url.pathname !== TELEGRAM_PROBE_CALLBACK_PATH || url.hash !== "" ||
      url.searchParams.getAll("privy_oauth_code").length !== 1 || url.searchParams.getAll("privy_oauth_state").length !== 1 ||
      url.searchParams.getAll("privy_oauth_provider").length > 1 ||
      (url.searchParams.has("privy_oauth_provider") && url.searchParams.get("privy_oauth_provider") !== "telegram") ||
      url.searchParams.has("privy_oauth_error")) return undefined;
  const code = scalar(url.searchParams.get("privy_oauth_code"), 4_096);
  const state = scalar(url.searchParams.get("privy_oauth_state"), 256);
  return code === undefined || state === undefined ? undefined : { code, state };
}

export function validProbeAuthorizationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.username === "" && url.password === "" && url.hash === "" &&
      (url.origin === "https://auth.privy.io" || url.origin === "https://oauth.telegram.org");
  } catch { return false; }
}

function clearContinuation(tab: ProbeTabStorage): void { tab.removeItem(CONTINUATION_KEY); }
function saveContinuation(tab: ProbeTabStorage, value: ProbeContinuation): void {
  const encoded = JSON.stringify(value);
  tab.setItem(CONTINUATION_KEY, encoded);
  if (tab.getItem(CONTINUATION_KEY) !== encoded) throw new Error("probe_storage_unavailable");
}
function consumeContinuation(tab: ProbeTabStorage, now: number): ProbeContinuation {
  const raw = tab.getItem(CONTINUATION_KEY);
  clearContinuation(tab); // Consume before asynchronous work; a reload cannot retry a code.
  if (raw === null || raw.length > 1_024) throw new Error("probe_return_invalid");
  const value: unknown = JSON.parse(raw);
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("probe_return_invalid");
  // SAFETY: session state is untrusted; every used field and the exact key set is checked.
  const input = value as { version?: unknown; appId?: unknown; state?: unknown; verifier?: unknown; startedAt?: unknown };
  const state = scalar(input.state, 256), verifier = scalar(input.verifier, 256);
  if (input.version !== 1 || input.appId !== TELEGRAM_PROBE_APP_ID || state === undefined || verifier === undefined ||
      typeof input.startedAt !== "number" || !Number.isSafeInteger(input.startedAt) || input.startedAt > now ||
      now - input.startedAt >= ATTEMPT_LIFETIME_MS ||
      Object.keys(value).sort().join(",") !== "appId,startedAt,state,verifier,version") throw new Error("probe_return_invalid");
  return { version: 1, appId: TELEGRAM_PROBE_APP_ID, state, verifier, startedAt: input.startedAt };
}

type PrivyInstance = InstanceType<typeof import("@privy-io/js-sdk-core").default>;
export interface ProbeProvider {
  initialize(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  generateURL(...args: Parameters<PrivyInstance["auth"]["oauth"]["generateURL"]>): Promise<{ url: string }>;
  loginWithCode(...args: Parameters<PrivyInstance["auth"]["oauth"]["loginWithCode"]>): Promise<void>;
}
export interface ProbeClient {
  start(): Promise<{ readonly url: string; readonly state: string; readonly verifier: string }>;
  finish(callback: ProbeCallback, verifier: string, signal: AbortSignal): Promise<string>;
  clear(): void;
}
async function defaultProbeProvider(config: VerificationPublicConfig, storage: PrivyStorage): Promise<ProbeProvider> {
  const { default: Privy } = await preloadPrivySdk();
  const client = new Privy({ appId: config.privyAppId, clientId: config.privyClientId, storage });
  return { initialize: () => client.initialize(), getAccessToken: () => client.getAccessToken(),
    generateURL: (...args) => client.auth.oauth.generateURL(...args),
    loginWithCode: async (...args) => { await client.auth.oauth.loginWithCode(...args); } };
}
export async function createProbeClient(signal: AbortSignal, dependencies: {
  readonly fetch?: typeof fetch;
  readonly provider?: (config: VerificationPublicConfig, storage: PrivyStorage) => Promise<ProbeProvider>;
} = {}): Promise<ProbeClient> {
  const config = await fetchVerificationConfig((input, init) => (dependencies.fetch ?? fetch)(input, { ...init, signal }));
  if (config.privyAppId !== TELEGRAM_PROBE_APP_ID) throw new Error("probe_unavailable");
  const storage = new MemoryOnlyStorage();
  let client: ProbeProvider;
  try { client = await (dependencies.provider ?? defaultProbeProvider)(config, storage); await client.initialize(); }
  catch { storage.clear(); throw new Error("probe_unavailable"); }
  return {
    async start() {
      const result = await client.generateURL("telegram", `${TELEGRAM_PROBE_ORIGIN}${TELEGRAM_PROBE_CALLBACK_PATH}`);
      // Pinned SDK 0.70.0 PKCE keys; only these temporary values survive the redirect.
      const state = scalar(storage.get("privy:state_code"), 256), verifier = scalar(storage.get("privy:code_verifier"), 256);
      if (state === undefined || verifier === undefined || !validProbeAuthorizationUrl(result.url)) throw new Error("probe_unavailable");
      return { url: result.url, state, verifier };
    },
    async finish(callback, verifier, activeSignal) {
      storage.put("privy:state_code", callback.state); storage.put("privy:code_verifier", verifier);
      await client.loginWithCode(callback.code, callback.state, "telegram", undefined, "login-or-sign-up",
        { embedded: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } } });
      if (activeSignal.aborted) throw new Error("probe_cancelled");
      const accessToken = await client.getAccessToken();
      if (activeSignal.aborted) throw new Error("probe_cancelled");
      const subject = accessToken === null ? undefined : privyAccessTokenSubject(accessToken);
      if (subject === undefined) throw new Error("probe_login_incomplete");
      // Browser observation only. The managed server lookup must independently confirm it.
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`privy:${subject}`));
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    },
    clear: () => storage.clear(),
  };
}

export type ProbeView = { readonly phase: "idle" | "busy" } |
  { readonly phase: "done"; readonly observation: ProbeObservation } | { readonly phase: "error"; readonly message: string };
interface ProbeAttempt { readonly abort: AbortController; readonly startedAt: number; client?: ProbeClient; redirecting: boolean }
export function createProbeController(options: {
  readonly tab: ProbeTabStorage; readonly origin: string; readonly navigate: (url: string) => void;
  readonly createClient?: typeof createProbeClient; readonly now?: () => number; readonly view: (value: ProbeView) => void;
}) {
  const now = options.now ?? Date.now;
  let active: ProbeAttempt | undefined;
  function cancel(message = "Login cancelled. You can start again.") {
    const attempt = active; active = undefined; attempt?.abort.abort(); attempt?.client?.clear();
    try { clearContinuation(options.tab); } catch { /* Storage refusal makes continuation unusable. */ }
    options.view({ phase: "error", message });
  }
  async function client(attempt: ProbeAttempt): Promise<ProbeClient> {
    const value = await (options.createClient ?? createProbeClient)(attempt.abort.signal);
    attempt.client = value;
    if (active !== attempt) { value.clear(); throw new Error("probe_cancelled"); }
    return value;
  }
  function enabled(): boolean { return telegramProbeEnabled(options.origin, options.origin, now()); }
  return {
    async start() {
      if (active !== undefined) return;
      if (!enabled()) { cancel("This staging login test is unavailable or expired."); return; }
      const attempt: ProbeAttempt = { abort: new AbortController(), startedAt: now(), redirecting: false };
      active = attempt; options.view({ phase: "busy" });
      try {
        clearContinuation(options.tab);
        const authorization = await (await client(attempt)).start();
        if (active !== attempt) return;
        if (!enabled() || now() - attempt.startedAt >= ATTEMPT_LIFETIME_MS || !validProbeAuthorizationUrl(authorization.url)) throw new Error("probe_unavailable");
        saveContinuation(options.tab, { version: 1, appId: TELEGRAM_PROBE_APP_ID, state: authorization.state,
          verifier: authorization.verifier, startedAt: attempt.startedAt });
        attempt.redirecting = true; options.navigate(authorization.url);
      } catch { if (active === attempt) cancel("Login could not start. Check that this browser allows temporary session storage, then try again."); }
      finally { attempt.client?.clear(); }
    },
    async resume(url: URL) {
      if (active !== undefined) return;
      if (!enabled()) { cancel("This staging login test is unavailable or expired."); return; }
      try {
        const callback = takeProbeCallback(url), saved = consumeContinuation(options.tab, now());
        if (callback === undefined || callback.state !== saved.state) throw new Error("probe_return_invalid");
        const attempt: ProbeAttempt = { abort: new AbortController(), startedAt: saved.startedAt, redirecting: false };
        active = attempt; options.view({ phase: "busy" });
        try {
          const fingerprint = await (await client(attempt)).finish(callback, saved.verifier, attempt.abort.signal);
          if (active !== attempt) return;
          if (!enabled() || now() - saved.startedAt >= ATTEMPT_LIFETIME_MS) throw new Error("probe_return_invalid");
          active = undefined; attempt.client?.clear();
          options.view({ phase: "done", observation: { startedAt: new Date(saved.startedAt).toISOString(),
            returnedAt: new Date(now()).toISOString(), providerSubjectFingerprint: fingerprint } });
        } catch { if (active === attempt) cancel("The login return could not complete. Start again."); }
        finally { attempt.client?.clear(); }
      } catch { cancel("That login return is invalid or expired. Start again in the same Telegram browser tab."); }
    },
    reset() { try { clearContinuation(options.tab); } catch { /* Start will refuse unavailable storage. */ } },
    cancel,
    tick() { if (active !== undefined && now() - active.startedAt >= ATTEMPT_LIFETIME_MS) cancel("The login test expired. Start again."); },
    dispose() {
      const attempt = active; active = undefined; attempt?.abort.abort(); attempt?.client?.clear();
      if (!attempt?.redirecting) { try { clearContinuation(options.tab); } catch { /* No usable continuation remains. */ } }
    },
  };
}
