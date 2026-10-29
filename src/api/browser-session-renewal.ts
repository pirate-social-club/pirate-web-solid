import { ApiClientError } from "@pirate/api-client";
import { SESSION_FENCED_EVENT } from "./browser-session-events.ts";
import { SessionAuthorityChangedError } from "./browser-auth-coordination.ts";

export interface BrowserSessionRenewalOptions {
  readonly key: number;
  readonly current: () => boolean;
  readonly lock: <T>(action: () => Promise<T>, signal: AbortSignal) => Promise<T>;
  readonly request: (signal: AbortSignal) => Promise<{ readonly user_id: string }>;
  readonly expectedAccount?: string;
  readonly accountChanged?: () => void;
}

export type BrowserSessionRenewalResult = "renewed" | "rejected";

/** Page coalescing plus a cross-tab lock. No provider or browser credential storage. */
export function createBrowserSessionRenewal(timeoutMs = 15_000) {
  let pending: { key: number; promise: Promise<BrowserSessionRenewalResult> } | undefined;
  return {
    renew(options: BrowserSessionRenewalOptions): Promise<BrowserSessionRenewalResult> {
      if (pending?.key === options.key) return pending.promise;
      const controller = new AbortController();
      const fenced = () => { if (!options.current()) controller.abort(new SessionAuthorityChangedError()); };
      if (typeof window !== "undefined") window.addEventListener(SESSION_FENCED_EVENT, fenced);
      const timer = setTimeout(() => controller.abort(new DOMException("Session renewal timed out", "TimeoutError")), timeoutMs);
      const check = () => {
        controller.signal.throwIfAborted();
        if (!options.current()) throw new SessionAuthorityChangedError();
      };
      // The abort race also bounds transports that ignore their AbortSignal.
      let stop!: () => void;
      const cancelled = new Promise<never>((_resolve, reject) => {
        stop = () => reject(controller.signal.reason);
        controller.signal.addEventListener("abort", stop, { once: true });
      });
      const start = options.lock(async (): Promise<BrowserSessionRenewalResult> => {
        check();
        try {
          const response = await options.request(controller.signal);
          check();
          if (options.expectedAccount !== undefined && response.user_id !== options.expectedAccount) {
            options.accountChanged?.();
            throw new SessionAuthorityChangedError();
          }
          return "renewed";
        } catch (error) {
          check();
          if (error instanceof ApiClientError && error.status === 401) return "rejected";
          throw error;
        }
      }, controller.signal);
      const promise = Promise.race([start, cancelled]).finally(() => {
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", stop);
        if (typeof window !== "undefined") window.removeEventListener(SESSION_FENCED_EVENT, fenced);
        if (pending?.promise === promise) pending = undefined;
      });
      pending = { key: options.key, promise };
      return promise;
    },
  };
}

export const browserSessionRenewal = createBrowserSessionRenewal();
