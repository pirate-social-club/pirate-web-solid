import { PrivyIdentityBootstrapRequired } from "../../api/privy-session.ts";

/**
 * Pure phase machine for the sign-in surface. It holds no Privy handle and
 * performs no network work, so the view and its stories can render every phase
 * without a session exchange. The controller in sign-in-session.ts owns the
 * side effects and drives these transitions.
 */
export type SignInPhase =
  | "loading"
  | "choose"
  | "code"
  | "working"
  | "signed-in"
  | "unavailable";

/** Identity methods offered on the choose phase, in presentation order. */
export type SignInMethod = "google" | "twitter" | "wallet";

export const SIGN_IN_METHODS: readonly SignInMethod[] = [
  "google",
  "twitter",
  "wallet",
];

export const SIGN_IN_CODE_LENGTH = 6;

export interface SignInState {
  readonly phase: SignInPhase;
  readonly email: string;
  readonly code: string;
  /** An attempt is in flight; controls disable and the CTA spinner. */
  readonly busy: boolean;
  /** User-safe failure text. Never carries provider or token detail. */
  readonly message: string;
}

export const initialSignInState: SignInState = {
  phase: "loading",
  email: "",
  code: "",
  busy: false,
  message: "",
};

/**
 * Failure text that never leaks provider internals.
 *
 * Registration-required is not a failure and never reaches here: a first visit
 * registers directly under the declaration the primary action carried.
 */
export function signInMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === "wallet_unavailable") return "No wallet found.";
    if (error.message === "wallet_auth_rejected") return "Wallet request cancelled.";
    if (error.message === "wallet_auth_failed") return "Wallet sign-in failed.";
  }
  return "Couldn’t sign in. Try again.";
}

export function isRegistrationRequired(error: unknown): boolean {
  return error instanceof PrivyIdentityBootstrapRequired;
}

/** Offer identity methods while the controller prepares their exchange. */
export function signInReady(state: SignInState): SignInState {
  return { ...state, phase: "choose", busy: false };
}

/** The exchange could not be created at all; no method can be offered. */
export function signInUnavailable(state: SignInState, error: unknown): SignInState {
  return {
    ...state,
    phase: "unavailable",
    busy: false,
    // The generic retry copy says nothing a user can act on. This names the
    // condition and the one action that can change it.
    message: "Sign-in can’t start right now. Reload the page to try again.",
  };
}

/** Move to a phase the user chose, clearing any stale failure text. */
export function signInMoved(state: SignInState, phase: SignInPhase): SignInState {
  return { ...state, phase, busy: false, message: "" };
}

export function signInWithEmail(state: SignInState, email: string): SignInState {
  return { ...state, email };
}

export function signInWithCode(state: SignInState, code: string): SignInState {
  return { ...state, code: code.replace(/\D/gu, "").slice(0, SIGN_IN_CODE_LENGTH) };
}

/**
 * An attempt started. `phase` is passed only for attempts that take over the
 * surface, such as an OAuth redirect; in-place attempts keep their phase and
 * show busy state on their own control.
 */
export function signInStarted(state: SignInState, phase?: SignInPhase): SignInState {
  return { ...state, phase: phase ?? state.phase, busy: true, message: "" };
}

export function signInCodeSent(state: SignInState): SignInState {
  return { ...state, phase: "code", busy: false, message: "" };
}

export function signInSucceeded(state: SignInState): SignInState {
  return { ...state, phase: "signed-in", busy: false, message: "" };
}

/**
 * An attempt failed. `recovery` is the phase whose controls let the user try
 * again, so the surface always lands somewhere actionable: leaving the phase
 * at "working" would pair a terminal error with a progress message and strand
 * the user with no control at all.
 */
export function signInFailed(
  state: SignInState,
  error: unknown,
  recovery: SignInPhase,
): SignInState {
  return { ...state, phase: recovery, busy: false, message: signInMessage(error) };
}

export function canSendCode(state: SignInState): boolean {
  return !state.busy && state.email.trim().length > 0;
}

export function canSubmitCode(state: SignInState): boolean {
  return !state.busy && state.code.trim().length === SIGN_IN_CODE_LENGTH;
}

/**
 * Every failure shows as the inline alert beside the controls that can retry
 * it, including the unavailable case: a terminal card with no form behind it
 * leaves the user nothing to act on.
 */
export function signInAlert(state: SignInState): string {
  return state.message;
}
