import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";

import {
  hasInjectedEthereumProvider,
  type OAuthProvider,
  type PrivySessionExchange,
} from "../../api/privy-session.ts";
import {
  SIGN_IN_CODE_LENGTH,
  initialSignInState,
  signInCodeSent,
  isRegistrationRequired,
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
import { acquireSignInExchange } from "./sign-in-preparation.ts";

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
  /** Test seam for the browser's injected EIP-1193 provider discovery. */
  readonly walletAvailable?: () => boolean;
}

export interface SignInSession {
  readonly state: Accessor<SignInState>;
  readonly walletAvailable: Accessor<boolean>;
  back(): void;
  chooseMethod(method: SignInMethod): void;
  resendCode(): void;
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

interface OAuthReturn {
  readonly authorizationCode: string;
  readonly provider: OAuthProvider;
  readonly returnedStateCode: string;
}

function oauthReturn(): OAuthReturn | undefined {
  const params = new URL(window.location.href).searchParams;
  const authorizationCode = params.get("code");
  const returnedStateCode = params.get("state");
  const provider = params.get("provider");
  if (
    (provider !== "google" && provider !== "twitter") ||
    authorizationCode === null ||
    returnedStateCode === null
  ) return undefined;
  return { authorizationCode, provider, returnedStateCode };
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
  // The gate effect resets this synchronously on reopen, which is a write from
  // an owned scope. That is deliberate here — the controller owns the phase —
  // so the signal opts in rather than deferring the reset into a microtask and
  // rendering the dismissed phase for a tick.
  const [state, setState] = createSignal<SignInState>(initialSignInState, {
    ownedWrite: true,
  });
  const [walletAvailable, setWalletAvailable] = createSignal(false, {
    ownedWrite: true,
  });
  let exchange: PrivySessionExchange | undefined;
  let exchangeLoad: Promise<PrivySessionExchange> | undefined;
  let generation = 0;

  const isCurrent = (token: number, handle: PrivySessionExchange) =>
    generation === token && exchange === handle;
  const isLoadCurrent = (token: number, load: Promise<PrivySessionExchange>) =>
    generation === token && exchangeLoad === load;

  const succeed = () => {
    setState(signInSucceeded);
    options.onAuthenticated?.();
  };

  const fail = (error: unknown, recovery: SignInPhase) => {
    if (isRegistrationRequired(error)) {
      // A first visit has no account yet. Creating one needs no decision from
      // the user, so it happens here instead of as a screen asking them to
      // confirm something they have already chosen by signing in.
      attempt(undefined, recovery, (handle) => handle.register(), succeed);
      return;
    }
    setState((current) => signInFailed(current, error, recovery));
  };

  /**
   * Supersedes the current exchange: the generation advances so anything still
   * in flight resolves into a surface it no longer owns and is dropped, and the
   * Privy client is released. This suppresses our own state writes, navigation,
   * and onAuthenticated callback; it cannot cancel work already running inside
   * Privy, which has no cancellation of its own, so a dismissed ceremony may
   * still complete server-side without the surface reacting to it.
   */
  const discard = () => {
    generation += 1;
    exchange?.clear();
    exchange = undefined;
    exchangeLoad = undefined;
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
      setWalletAvailable(false);
      const runToken = generation;
      if (!enabled || typeof window === "undefined") return;
      // Sample after hydration and whenever the surface opens. This keeps the
      // server and first client render identical while still discovering an
      // extension that injected before the user opened the sign-in surface.
      setWalletAvailable(options.walletAvailable?.() ?? hasInjectedEthereumProvider());
      // The method form needs no Privy handle. Show it immediately and let the
      // first operation await initialization; provider returns remain a
      // dedicated working phase because they resume without another choice.
      const returnedOAuth = oauthReturn();
      setState(returnedOAuth === undefined
        ? signInReady(initialSignInState)
        : signInStarted(initialSignInState, "working"));

      const load = options.createExchange
        ? options.createExchange()
        : acquireSignInExchange();
      exchangeLoad = load;

      void load
        .then(async (candidate) => {
          if (!isLoadCurrent(runToken, load)) {
            candidate.clear();
            return;
          }
          exchange = candidate;
          const stillCurrent = () => isCurrent(runToken, candidate);

          if (returnedOAuth === undefined) return;

          try {
            await candidate.completeOAuth(
              returnedOAuth.provider,
              returnedOAuth.authorizationCode,
              returnedOAuth.returnedStateCode,
            );
            if (stillCurrent()) succeed();
          } catch (error) {
            if (stillCurrent()) fail(error, "choose");
          }
        })
        .catch((error: unknown) => {
          if (isLoadCurrent(runToken, load)) {
            setState((current) => signInUnavailable(current, error));
          }
        });
    },
  );

  /**
   * Runs one attempt against the exchange load that is current when it starts.
   * The visible form can therefore collect intent while initialization is in
   * flight; its first submission shows busy state and awaits the same promise.
   * `settle` receives the operation's result on the success path; failures
   * recover to `recovery`. Both are skipped when the attempt is no longer
   * current, so every effect that follows an attempt — a state change, a
   * navigation, the authenticated callback — is gated on the same check.
   */
  const attempt = <Result,>(
    phase: SignInPhase | undefined,
    recovery: SignInPhase,
    operation: (handle: PrivySessionExchange) => Promise<Result>,
    settle?: (value: Result) => void,
  ) => {
    const load = exchangeLoad;
    if (load === undefined) return;
    const token = generation;
    setState((current) => signInStarted(current, phase));

    void (async () => {
      let handle: PrivySessionExchange;
      try {
        handle = await load;
      } catch {
        // The owning load handler moves the surface to unavailable.
        return;
      }
      if (!isLoadCurrent(token, load)) return;
      exchange ??= handle;
      const stillCurrent = () => isCurrent(token, handle);
      try {
        const value = await operation(handle);
        if (stillCurrent()) settle?.(value);
      } catch (error) {
        if (stillCurrent()) fail(error, recovery);
      }
    })();
  };

  return {
    state,
    walletAvailable,
    back() {
      setState((current) => signInMoved(current, "choose"));
    },
    chooseMethod(method) {
      if (method === "wallet") {
        attempt("working", "choose", (handle) => handle.loginWithWallet(), succeed);
        return;
      }
      // Navigating is the settlement, so it runs behind the same currency check
      // as any state write: a dismissed ceremony must not redirect the page.
      attempt(
        "working",
        "choose",
        (handle) => handle.beginOAuth(method, oauthRedirect(method)),
        (url) => { window.location.assign(url); },
      );
    },
    resendCode() {
      const address = state().email.trim();
      if (address.length === 0) return;
      attempt(undefined, "code", (handle) => handle.sendCode(address), () => {
        setState(signInCodeSent);
      });
    },
    sendCode() {
      const address = state().email.trim();
      if (address.length === 0) return;
      attempt(undefined, "choose", (handle) => handle.sendCode(address), () => {
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
      if (current.code.trim().length !== SIGN_IN_CODE_LENGTH) return;
      attempt(
        undefined,
        "code",
        (handle) => handle.loginWithCode(current.email.trim(), current.code.trim()),
        succeed,
      );
    },
  };
}
