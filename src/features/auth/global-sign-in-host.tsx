/** @jsxImportSource @solidjs/web */
import { createSignal, onCleanup } from "solid-js";

import type { PrivySessionExchange } from "../../api/privy-session.ts";
import { refreshSession } from "../../api/session.ts";
import { SignInModal } from "./sign-in-modal.tsx";
import { preloadSignInAssets, prepareSignIn } from "./sign-in-preparation.ts";
import { createSignInSession } from "./sign-in-session.ts";

export const GLOBAL_SIGN_IN_EVENT = "pirate:connect";

/** Opens the single app-owned sign-in ceremony from route or chrome controls. */
export function requestGlobalSignIn(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(GLOBAL_SIGN_IN_EVENT));
  }
}

interface SignInCompletion {
  readonly complete: (authenticated: boolean) => void;
}

/** A continuation belongs to this prompt only; dismissal and route exit cancel it. */
export function requestGlobalSignInCompletion(signal: AbortSignal): Promise<boolean> {
  if (typeof window === "undefined" || signal.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    const finish = (authenticated: boolean) => {
      signal.removeEventListener("abort", cancel);
      resolve(authenticated && !signal.aborted);
    };
    const cancel = () => finish(false);
    signal.addEventListener("abort", cancel, { once: true });
    window.dispatchEvent(new CustomEvent<SignInCompletion>(GLOBAL_SIGN_IN_EVENT, { detail: { complete: finish } }));
  });
}

/**
 * Starts the memory-only identity client after focus or pointer-down intent.
 * Callers must not use passive hover alone to contact the identity provider.
 */
export function prepareGlobalSignIn(): void {
  prepareSignIn();
}

/** Warms same-origin sign-in assets without creating or contacting a client. */
export function preloadGlobalSignInAssets(): void {
  preloadSignInAssets();
}

export interface GlobalSignInHostProps {
  readonly createExchange?: () => Promise<PrivySessionExchange>;
  readonly refresh?: () => void;
}

/**
 * Owns the one app-level listener for route-local authentication prompts.
 * A successful exchange refreshes the shared session store; the application
 * root re-resolves reactively, so the chrome flips without reloading the
 * document and re-paying hydration.
 */
export function GlobalSignInHost(props: GlobalSignInHostProps = {}) {
  const [open, setOpen] = createSignal(false);
  const [confirmIdentity, setConfirmIdentity] = createSignal(false);
  let completion: SignInCompletion | undefined;
  const finishPrompt = (authenticated: boolean) => {
    const pending = completion;
    completion = undefined;
    pending?.complete(authenticated);
  };
  const completeAuthentication = () => {
    setOpen(false);
    if (props.refresh) props.refresh();
    else refreshSession();
    finishPrompt(true);
  };
  const session = createSignInSession({
    createExchange: props.createExchange,
    enabled: open,
    onAuthenticated: completeAuthentication,
  });
  const openSignIn = (event: Event) => {
    // SAFETY: this app-owned event is dispatched only by the request helpers above and carries no credentials.
    const detail = event instanceof CustomEvent && event.detail !== null ? event.detail as SignInCompletion | undefined : undefined;
    if (completion !== undefined) finishPrompt(false);
    completion = detail;
    setConfirmIdentity(detail !== undefined);
    setOpen(true);
  };
  const listening = typeof window !== "undefined";
  // Install during component setup. A deferred effect leaves a small window
  // where a hydrated route can dispatch the sign-in request before the global
  // host is listening, dropping the user's first click.
  if (listening) window.addEventListener(GLOBAL_SIGN_IN_EVENT, openSignIn);
  onCleanup(() => {
    finishPrompt(false);
    if (listening) window.removeEventListener(GLOBAL_SIGN_IN_EVENT, openSignIn);
  });

  return <SignInModal confirmIdentity={confirmIdentity()} onOpenChange={next => { setOpen(next); if (!next) finishPrompt(false); }} open={open()} session={session} />;
}
