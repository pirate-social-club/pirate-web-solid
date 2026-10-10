import { replaceSessionAuthority } from "./browser-session-events.ts";

/** A page-local provider session, never a persisted Pirate bearer credential. */
export interface BrowserIdentitySession {
  renew(signal: AbortSignal): Promise<boolean>;
  clear(): void;
}

export function createBrowserIdentitySessionStore(timeoutMs = 30_000) {
  let current: BrowserIdentitySession | undefined;
  let pending: Promise<boolean> | undefined;
  let controller: AbortController | undefined;
  const clear = () => {
    const previous = current;
    current = undefined;
    pending = undefined;
    controller?.abort();
    controller = undefined;
    previous?.clear();
  };
  return {
    retain(session: BrowserIdentitySession) {
      clear();
      current = session;
    },
    clear,
    renew(): Promise<boolean> {
      if (pending !== undefined) return pending;
      const session = current;
      if (session === undefined) return Promise.resolve(false);
      const renewalController = new AbortController();
      controller = renewalController;
      const signal = renewalController.signal;
      let stop!: () => void;
      const cancelled = new Promise<boolean>(resolve => {
        stop = () => resolve(false);
        signal.addEventListener("abort", stop, { once: true });
      });
      const timer = setTimeout(() => renewalController.abort(), timeoutMs);
      const start = async () => session.renew(signal);
      const renewal = start().then(
        renewed => current === session && renewed,
        () => false,
      );
      const request = Promise.race([renewal, cancelled]);
      pending = request;
      void request.then(renewed => {
        clearTimeout(timer);
        signal.removeEventListener("abort", stop);
        if (pending !== request) return;
        pending = undefined;
        if (!renewed && current === session) clear();
      });
      return request;
    },
  };
}

const pageIdentitySession = createBrowserIdentitySessionStore();
export const browserIdentitySession = {
  ...pageIdentitySession,
  retain(session: BrowserIdentitySession) {
    pageIdentitySession.retain(session);
    replaceSessionAuthority();
  },
};
