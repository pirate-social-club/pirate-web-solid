import { createSessionApiClient, readCsrfCookie, sessionRequestOptions } from "./client.ts";
import type { BrowserIdentitySession } from "./browser-identity-session.ts";
import { defaultPrivyFactory, MemoryOnlyStorage, type PrivyAuthClient, type PrivyFactory } from "./privy-session.ts";
import { privyAccessTokenSubject, restoreWalletAuthorization } from "./privy-wallet-authorization.ts";
import { fetchVerificationConfig, type VerificationPublicConfig } from "./verification-config.ts";
import { captureSessionAuthority, isCurrentSessionAuthority } from "./browser-session-events.ts";

interface BootstrapDependencies {
  config(signal: AbortSignal): Promise<VerificationPublicConfig>;
  createPrivy: PrivyFactory;
  restore: typeof restoreWalletAuthorization;
  account(signal: AbortSignal): Promise<string | undefined>;
  exchange(proof: string, signal: AbortSignal): Promise<string>;
  current(): boolean;
  fenceRenewal(): () => boolean;
  now(): number;
}

/** A raw account read never tries renewal or invalidates route-owned work. */
async function readAccount(signal: AbortSignal): Promise<string | undefined> {
  const response = await fetch("/api/users/me", { credentials: "same-origin", cache: "no-store", signal });
  if (response.status === 401) return undefined;
  if (!response.ok) throw new Error("account_unavailable");
  const value: unknown = await response.json();
  if (value === null || typeof value !== "object" || !("id" in value) || typeof value.id !== "string") {
    throw new Error("account_unavailable");
  }
  return value.id;
}

/** Restore a provider client only under a fresh matching application cookie.
 * The snapshot's original expiry is never renewed, and no wallet is activated. */
export async function restoreBrowserIdentitySession(
  accountId: string,
  signal: AbortSignal,
  current: () => boolean,
  overrides: Partial<BootstrapDependencies> = {},
): Promise<BrowserIdentitySession | undefined> {
  const dependencies: BootstrapDependencies = {
    config: value => fetchVerificationConfig((input, init) => fetch(input, { ...init, signal: value })),
    createPrivy: defaultPrivyFactory,
    restore: restoreWalletAuthorization,
    account: readAccount,
    exchange: async (proof, value) => {
      const csrf = readCsrfCookie();
      const response = await createSessionApiClient().post_authSessionExchange({
        body: { proof: { type: "privy_access_token", privy_access_token: proof } },
      }, { ...(csrf === undefined ? {} : sessionRequestOptions(csrf)), signal: value });
      return response.user.id;
    },
    current,
    fenceRenewal: () => {
      const authority = captureSessionAuthority();
      return () => isCurrentSessionAuthority(authority);
    },
    now: Date.now,
    ...overrides,
  };
  const storage = new MemoryOnlyStorage();
  let client: PrivyAuthClient | undefined;
  let retained = false;
  let disposed = false;
  const clear = () => {
    disposed = true;
    storage.clear();
    client?.dispose?.();
  };
  const live = () => !disposed && !signal.aborted;
  const alive = () => live() && dependencies.current();
  signal.addEventListener("abort", clear, { once: true });
  try {
    if (!alive()) return undefined;
    const config = await dependencies.config(signal);
    if (!alive()) return undefined;
    const binding = dependencies.restore(storage, config.privyAppId);
    if (binding?.accountId !== accountId || dependencies.now() >= binding.expiresAt) return undefined;
    if (await dependencies.account(signal) !== accountId || !alive()) return undefined;
    client = await dependencies.createPrivy(config, storage);
    if (!alive()) return undefined;
    await client.initialize();
    if (!alive()) return undefined;
    const proof = await client.getAccessToken();
    if (!alive() || proof === null || privyAccessTokenSubject(proof) !== binding.subject ||
      dependencies.now() >= binding.expiresAt) return undefined;
    if (await dependencies.account(signal) !== accountId || !alive() ||
      dependencies.now() >= binding.expiresAt) return undefined;
    const provider = client;
    retained = true;
    return {
      clear,
      async renew(renewalSignal) {
        const combined = AbortSignal.any([signal, renewalSignal]);
        const authorityCurrent = dependencies.fenceRenewal();
        const active = () => live() && !combined.aborted && authorityCurrent();
        if (!active()) return false;
        const token = await provider.getAccessToken();
        if (!active() || token === null || privyAccessTokenSubject(token) !== binding.subject) return false;
        const observed = await dependencies.account(combined);
        if (!active() || (observed !== undefined && observed !== accountId)) return false;
        const renewed = await dependencies.exchange(token, combined);
        return active() && renewed === accountId;
      },
    };
  } catch {
    return undefined;
  } finally {
    if (!retained) clear();
    signal.removeEventListener("abort", clear);
  }
}
