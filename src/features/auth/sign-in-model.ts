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
  | "email"
  | "code"
  | "register"
  | "working"
  | "signed-in"
  | "unavailable";

/** Identity methods offered on the choose phase, in presentation order. */
export type SignInMethod = "google" | "twitter" | "wallet" | "email";

export const SIGN_IN_METHODS: readonly SignInMethod[] = [
  "google",
  "twitter",
  "wallet",
  "email",
];

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
 * Failure text that never leaks provider internals. Registration-required is
 * not a failure: it is the first-visit path into the register phase, and its
 * text reads as an invitation rather than an error.
 */
export function signInMessage(error: unknown): string {
  if (error instanceof PrivyIdentityBootstrapRequired) {
    return "That identity is ready for a new Pirate account.";
  }
  if (error instanceof Error) {
    if (error.message === "wallet_unavailable") return "No injected wallet was found in this browser.";
    if (error.message === "wallet_auth_failed") return "The wallet signature was not completed.";
    if (error.message === "session_failed") return "The session cookie could not be established. Please try again.";
  }
  return "Sign in failed safely. Please try again.";
}

export function isRegistrationRequired(error: unknown): boolean {
  return error instanceof PrivyIdentityBootstrapRequired;
}

/** The exchange resolved; offer the identity methods. */
export function signInReady(state: SignInState): SignInState {
  return { ...state, phase: "choose", busy: false };
}

/** The exchange could not be created at all; no method can be offered. */
export function signInUnavailable(state: SignInState, error: unknown): SignInState {
  return { ...state, phase: "unavailable", busy: false, message: signInMessage(error) };
}

/** Move to a phase the user chose, clearing any stale failure text. */
export function signInMoved(state: SignInState, phase: SignInPhase): SignInState {
  return { ...state, phase, busy: false, message: "" };
}

export function signInWithEmail(state: SignInState, email: string): SignInState {
  return { ...state, email };
}

export function signInWithCode(state: SignInState, code: string): SignInState {
  return { ...state, code };
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
  return {
    ...state,
    phase: isRegistrationRequired(error) ? "register" : recovery,
    busy: false,
    message: signInMessage(error),
  };
}

export function canSendCode(state: SignInState): boolean {
  return !state.busy && state.email.trim().length > 0;
}

export function canSubmitCode(state: SignInState): boolean {
  return !state.busy && state.code.trim().length > 0;
}

/** Failure text belongs to the register phase's own copy, not the alert. */
export function signInAlert(state: SignInState): string {
  if (state.message.length === 0) return "";
  if (state.phase === "register" || state.phase === "unavailable") return "";
  return state.message;
}
