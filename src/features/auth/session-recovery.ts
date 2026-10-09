import { ApiClientError } from "@pirate/api-client";
import { browserIdentitySession } from "../../api/browser-identity-session";
import { readCsrfCookie } from "../../api/client";
import { resolveAccountSession, refreshSession, invalidateSession } from "../../api/session";
import type { AccountSessionResolution } from "../../api/session";
import { requestGlobalSignInCompletion } from "./global-sign-in-host";

export interface SessionRecoveryDependencies {
  account(): Promise<AccountSessionResolution>;
  csrfPresent(): boolean;
  renew(): Promise<boolean>;
  signIn(signal: AbortSignal): Promise<boolean>;
  invalidate(): void;
  refresh(): void;
}

/** Check before a write or wallet action. Never replay the action itself. */
export function createSessionRecovery(dependencies: SessionRecoveryDependencies) {
  let pending: Promise<boolean> | undefined;
  const current = async () => {
    try { return await dependencies.account(); }
    catch (error) {
      if (error instanceof ApiClientError && error.status === 401) return "anonymous" as const;
      throw error;
    }
  };
  return async (expectedUserId: string, signal: AbortSignal): Promise<boolean> => {
    if (signal.aborted) return false;
    const account = await current();
    if (signal.aborted) return false;
    if (account !== "anonymous") {
      if (account.userId !== expectedUserId) return false;
      if (dependencies.csrfPresent()) return true;
    }
    const recover = async () => {
      if (!await dependencies.renew()) {
        dependencies.invalidate();
        if (signal.aborted || !await dependencies.signIn(signal)) return false;
      }
      return dependencies.csrfPresent();
    };
    const request = pending ??= recover();
    try {
      if (!await request || signal.aborted) return false;
      const restored = await current();
      if (signal.aborted || restored === "anonymous" || restored.userId !== expectedUserId) return false;
      dependencies.refresh();
      return true;
    } finally {
      if (pending === request) pending = undefined;
    }
  };
}

export const ensureApplicationSession = createSessionRecovery({
  // Explicit transport bypasses the cached authenticated result.
  account: () => resolveAccountSession({ timeoutMs: 15_000 }),
  csrfPresent: () => readCsrfCookie() !== undefined,
  renew: () => browserIdentitySession.renew(),
  signIn: requestGlobalSignInCompletion,
  invalidate: invalidateSession,
  refresh: refreshSession,
});
