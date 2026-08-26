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
 */
export function createSignInSession(options: SignInSessionOptions = {}): SignInSession {
  const [state, setState] = createSignal<SignInState>(initialSignInState);
  let exchange: PrivySessionExchange | undefined;

  const succeed = () => {
    setState(signInSucceeded);
    options.onAuthenticated?.();
  };

  const fail = (error: unknown, recovery: SignInState["phase"]) => {
    setState((current) => signInFailed(current, error, recovery));
  };

  createEffect(
    () => options.enabled?.() ?? true,
    (enabled) => {
      if (!enabled || typeof window === "undefined") return;
      let active = true;
      const load = options.createExchange
        ? options.createExchange()
        : fetchVerificationConfig().then((config) => createPrivySessionExchange(config));

      void load
        .then(async (candidate) => {
          if (!active) {
            candidate.clear();
            return;
          }
          exchange = candidate;
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
            succeed();
          } catch (error) {
            fail(error, "choose");
          }
        })
        .catch((error: unknown) => {
          if (active) setState((current) => signInUnavailable(current, error));
        });

      onCleanup(() => {
        active = false;
        exchange?.clear();
        exchange = undefined;
      });
    },
  );

  const beginOAuth = async (provider: OAuthProvider) => {
    if (exchange === undefined) return;
    setState((current) => signInStarted(current, "working"));
    try {
      const url = await exchange.beginOAuth(provider, oauthRedirect(provider));
      window.location.assign(url);
    } catch (error) {
      fail(error, "choose");
    }
  };

  const loginWithWallet = async () => {
    if (exchange === undefined) return;
    setState((current) => signInStarted(current, "working"));
    try {
      await exchange.loginWithWallet();
      succeed();
    } catch (error) {
      fail(error, "choose");
    }
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
        void loginWithWallet();
        return;
      }
      void beginOAuth(method);
    },
    register() {
      if (exchange === undefined) return;
      const handle = exchange;
      setState((current) => signInStarted(current));
      void (async () => {
        try {
          await handle.register();
          succeed();
        } catch (error) {
          fail(error, "register");
        }
      })();
    },
    sendCode() {
      if (exchange === undefined) return;
      const handle = exchange;
      const address = state().email.trim();
      if (address.length === 0) return;
      setState((current) => signInStarted(current));
      void (async () => {
        try {
          await handle.sendCode(address);
          setState(signInCodeSent);
        } catch (error) {
          fail(error, "email");
        }
      })();
    },
    setCode(code) {
      setState((current) => signInWithCode(current, code));
    },
    setEmail(email) {
      setState((current) => signInWithEmail(current, email));
    },
    submitCode() {
      if (exchange === undefined) return;
      const handle = exchange;
      const current = state();
      if (current.code.trim().length === 0) return;
      setState((value) => signInStarted(value));
      void (async () => {
        try {
          await handle.loginWithCode(current.email.trim(), current.code.trim());
          succeed();
        } catch (error) {
          fail(error, "code");
        }
      })();
    },
  };
}
