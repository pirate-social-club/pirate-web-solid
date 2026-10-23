import { replaceSessionAuthority } from "./browser-session-events.ts";

/** A page-local provider session, never a persisted Pirate bearer credential. */
export interface BrowserIdentitySession {
  renew(signal: AbortSignal): Promise<boolean>;
  activatePersonaWallet?(accountId: string, personaId: string, idempotencyKey: string, signal: AbortSignal): Promise<void>;
  clear(): void;
}

export function createBrowserIdentitySessionStore(timeoutMs = 30_000) {
  let current: BrowserIdentitySession | undefined;
  let pending: Promise<boolean> | undefined;
  let controller: AbortController | undefined;
  const activations = new Set<AbortController>();
  let bootstrapController: AbortController | undefined;
  let bootstrapping: Promise<boolean> | undefined;
  const clear = () => {
    const previous = current;
    current = undefined;
    pending = undefined;
    controller?.abort();
    controller = undefined;
    bootstrapController?.abort();
    bootstrapController = undefined;
    bootstrapping = undefined;
    for (const activation of activations) activation.abort();
    activations.clear();
    previous?.clear();
  };
  return {
    retain(session: BrowserIdentitySession) {
      clear();
      current = session;
    },
    clear,
    /** Restore only an already verified account, without replacing its authority epoch. */
    bootstrap(restore: (signal: AbortSignal) => Promise<BrowserIdentitySession | undefined>): Promise<boolean> {
      if (current !== undefined) return Promise.resolve(true);
      if (bootstrapping !== undefined) return bootstrapping;
      const control = new AbortController();
      bootstrapController = control;
      const timer = setTimeout(() => control.abort(), timeoutMs);
      let stop!: () => void;
      const cancelled = new Promise<boolean>(resolve => {
        stop = () => resolve(false);
        control.signal.addEventListener("abort", stop, { once: true });
      });
      const candidate = restore(control.signal).then(session => {
        if (control.signal.aborted || bootstrapController !== control || current !== undefined) {
          session?.clear();
          return false;
        }
        current = session;
        return session !== undefined;
      }, () => false);
      const pendingRestore = Promise.race([candidate, cancelled]).finally(() => {
        clearTimeout(timer);
        control.signal.removeEventListener("abort", stop);
        if (bootstrapController === control) { bootstrapController = undefined; bootstrapping = undefined; }
      });
      bootstrapping = pendingRestore;
      return pendingRestore;
    },
    async activatePersonaWallet(accountId: string, personaId: string, idempotencyKey: string, signal: AbortSignal): Promise<boolean> {
      const session = current;
      if (session?.activatePersonaWallet === undefined || signal.aborted) return false;
      const activation = new AbortController();
      activations.add(activation);
      const combined = AbortSignal.any([signal, activation.signal]);
      let stop!: () => void;
      const cancelled = new Promise<never>((_resolve, reject) => {
        stop = () => reject(combined.reason ?? new DOMException("Activation cancelled", "AbortError"));
        combined.addEventListener("abort", stop, { once: true });
      });
      const timer = setTimeout(() => activation.abort(), timeoutMs);
      try {
        await Promise.race([session.activatePersonaWallet(accountId, personaId, idempotencyKey, combined), cancelled]);
        return current === session && !combined.aborted;
      } finally { clearTimeout(timer); combined.removeEventListener("abort", stop); activations.delete(activation); }
    },
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
