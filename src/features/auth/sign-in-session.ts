import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";

import {
  createPrivySessionExchange,
  type OAuthProvider,
  type PrivySessionExchange,
} from "../../api/privy-session.ts";
import { fetchVerificationConfig } from "../../api/verification-config.ts";
import {
  initialSignInState,
  signInCodeSent,
  signInFailed,
  signInMoved,
  signInReady,
  signInStarted,
  signInSucceeded,
  signInUnavailable,
  signInWithCode,
  signInWithEmail,
  type SignInMethod,
  type SignInPhase,
  type SignInState,
} from "./sign-in-model.ts";

export interface SignInSessionOptions {
  /**
   * Called once the session cookie is established. The surface also settles on
   * its signed-in phase, which is what the deep-link route shows; a caller that
   * navigates or closes on this callback never sees it.
   */
  readonly onAuthenticated?: () => void;
  /**
   * Test seam. Defaults to the real Privy exchange built from the public
   * verification config; a test or a harness passes its own so no network work
   * happens.
   */
  readonly createExchange?: () => Promise<PrivySessionExchange>;
  /**
   * Gates the identity ceremony. The shell passes its modal's open state so a
   * page load by an anonymous visitor does not fetch the verification config or
   * boot a Privy client for a surface nobody opened. Defaults to enabled, which
   * is what the /auth/sign-in deep link wants.
   */
  readonly enabled?: () => boolean;
}

export interface SignInSession {
  readonly state: Accessor<SignInState>;
  back(): void;
  chooseMethod(method: SignInMethod): void;
  register(): void;
  sendCode(): void;
  setCode(code: string): void;
  setEmail(email: string): void;
  submitCode(): void;
}

function oauthRedirect(provider: OAuthProvider): string {
  const redirect = new URL("/auth/sign-in", window.location.origin);
  redirect.searchParams.set("provider", provider);
  return redirect.toString();
}

/**
 * Owns the Privy identity ceremony and drives the pure phase model. Every
 * failure path lands on a phase that still offers a control, so a failed OAuth
 * return can never leave the surface showing progress copy with no way out.
 *
 * Each attempt captures the exchange it started on together with a generation
 * that advances whenever an exchange is adopted or discarded. A request that
 * resolves after the user closed the surface — or after a reopen built a fresh
 * exchange — is dropped instead of writing into a surface it no longer owns.
 */
export function createSignInSession(options: SignInSessionOptions = {}): SignInSession {
  const [state, setState] = createSignal<SignInState>(initialSignInState);
  let exchange: PrivySessionExchange | undefined;
  let generation = 0;

  const isCurrent = (token: number, handle: PrivySessionExchange) =>
    generation === token && exchange === handle;

  const succeed = () => {
    setState(signInSucceeded);
    options.onAuthenticated?.();
  };

  const fail = (error: unknown, recovery: SignInPhase) => {
    setState((current) => signInFailed(current, error, recovery));
  };

  /**
   * Supersedes the current exchange: the generation advances so anything still
   * in flight resolves into a surface it no longer owns and is dropped, and the
   * Privy client is released.
   */
  const discard = () => {
    generation += 1;
    exchange?.clear();
    exchange = undefined;
  };

  onCleanup(discard);

  createEffect(
    () => options.enabled?.() ?? true,
    (enabled) => {
      // Runs on every re-run, including the one that observes the gate closing.
      // A cleanup registered inside this effect would not: in this Solid
      // version those run at disposal only, which would leak a client per
      // open/close cycle and leave stale attempts looking current.
      discard();
      const runToken = generation;
      if (!enabled || typeof window === "undefined") return;

      const load = options.createExchange
        ? options.createExchange()
        : fetchVerificationConfig().then((config) => createPrivySessionExchange(config));

      void load
        .then(async (candidate) => {
          if (generation !== runToken) {
            candidate.clear();
            return;
          }
          exchange = candidate;
          const stillCurrent = () => isCurrent(runToken, candidate);

          const params = new URL(window.location.href).searchParams;
          const authorizationCode = params.get("code");
          const returnedStateCode = params.get("state");
          const provider = params.get("provider");
          const isOAuthReturn =
            (provider === "google" || provider === "twitter") &&
            authorizationCode !== null &&
            returnedStateCode !== null;

          if (!isOAuthReturn) {
            setState(signInReady);
            return;
          }

          setState((current) => signInStarted(current, "working"));
          try {
            await candidate.completeOAuth(provider, authorizationCode, returnedStateCode);
            if (stillCurrent()) succeed();
          } catch (error) {
            if (stillCurrent()) fail(error, "choose");
          }
        })
        .catch((error: unknown) => {
          if (generation === runToken) {
            setState((current) => signInUnavailable(current, error));
          }
        });
    },
  );

  /**
   * Runs one attempt against the exchange that is current when it starts.
   * `settle` receives the success path; failures recover to `recovery`. Both
   * are skipped when the attempt is no longer current.
   */
  const attempt = (
    phase: SignInPhase | undefined,
    recovery: SignInPhase,
    operation: (handle: PrivySessionExchange) => Promise<void>,
    settle?: () => void,
  ) => {
    const handle = exchange;
    if (handle === undefined) return;
    const token = generation;
    const stillCurrent = () => isCurrent(token, handle);
    setState((current) => signInStarted(current, phase));

    void (async () => {
      try {
        await operation(handle);
        if (stillCurrent()) settle?.();
      } catch (error) {
        if (stillCurrent()) fail(error, recovery);
      }
    })();
  };

  return {
    state,
    back() {
      setState((current) => signInMoved(current, current.phase === "code" ? "email" : "choose"));
    },
    chooseMethod(method) {
      if (method === "email") {
        setState((current) => signInMoved(current, "email"));
        return;
      }
      if (method === "wallet") {
        attempt("working", "choose", (handle) => handle.loginWithWallet(), succeed);
        return;
      }
      // The redirect leaves the page, so a successful begin has nothing to settle.
      attempt("working", "choose", async (handle) => {
        const url = await handle.beginOAuth(method, oauthRedirect(method));
        window.location.assign(url);
      });
    },
    register() {
      attempt(undefined, "register", (handle) => handle.register(), succeed);
    },
    sendCode() {
      const address = state().email.trim();
      if (address.length === 0) return;
      attempt(undefined, "email", (handle) => handle.sendCode(address), () => {
        setState(signInCodeSent);
      });
    },
    setCode(code) {
      setState((current) => signInWithCode(current, code));
    },
    setEmail(email) {
      setState((current) => signInWithEmail(current, email));
    },
    submitCode() {
      const current = state();
      if (current.code.trim().length === 0) return;
      attempt(
        undefined,
        "code",
        (handle) => handle.loginWithCode(current.email.trim(), current.code.trim()),
        succeed,
      );
    },
  };
}
