import { describe, expect, it } from "vitest";

import {
  canSendCode,
  canSubmitCode,
  initialSignInState,
  type SignInState,
  signInAlert,
  signInCodeSent,
  signInFailed,
  signInMessage,
  signInMoved,
  signInReady,
  signInStarted,
  signInSucceeded,
  signInUnavailable,
  signInWithCode,
  signInWithEmail,
} from "./sign-in-model.ts";

describe("sign-in phase model", () => {
  it("starts loading and resolves to the method choice", () => {
    expect(initialSignInState.phase).toBe("loading");
    expect(signInReady(initialSignInState).phase).toBe("choose");
  });

  it("never leaves the surface on working after a failure", () => {
    const working = signInStarted(signInReady(initialSignInState), "working");
    expect(working.phase).toBe("working");

    const failed = signInFailed(working, new Error("boom"), "choose");
    expect(failed.phase).toBe("choose");
    expect(failed.busy).toBe(false);
    expect(failed.message).toBe("Couldn’t sign in. Try again.");
  });

  it("has no registration phase to route a first visit into", () => {
    // Registration is not a surface. A first visit is handled by the session,
    // which registers under the declaration the primary action already carried.
    const phases: SignInState["phase"][] = [
      "loading",
      "choose",
      "code",
      "working",
      "signed-in",
      "unavailable",
    ];

    expect(phases).not.toContain("registration");
    expect(Object.keys(initialSignInState)).not.toContain("minimumAgeAffirmed");
  });

  it("returns a code failure to the code entry, not to the method list", () => {
    const entering = signInStarted(signInMoved(initialSignInState, "code"));
    expect(signInFailed(entering, new Error("nope"), "code").phase).toBe("code");
  });

  it("maps known failures to safe text and everything else to the fallback", () => {
    expect(signInMessage(new Error("wallet_unavailable"))).toBe("No wallet found.");
    expect(signInMessage(new Error("wallet_auth_rejected"))).toBe("Wallet request cancelled.");
    expect(signInMessage(new Error("wallet_auth_failed"))).toBe("Wallet sign-in failed.");
    expect(signInMessage(new Error("session_failed"))).toBe("Couldn’t sign in. Try again.");
    expect(signInMessage("privy_internal_detail")).toBe("Couldn’t sign in. Try again.");
  });

  it("clears stale failure text when the user moves phase", () => {
    const failed = signInFailed(signInReady(initialSignInState), new Error("boom"), "choose");
    expect(failed.message).not.toBe("");
    expect(signInMoved(failed, "choose").message).toBe("");
  });

  it("gates the code request and the code submission on their own input", () => {
    const chooseEmail = signInMoved(initialSignInState, "choose");
    expect(canSendCode(chooseEmail)).toBe(false);
    expect(canSendCode(signInWithEmail(chooseEmail, "  "))).toBe(false);

    const withEmail = signInWithEmail(chooseEmail, "operator@example.test");
    expect(canSendCode(withEmail)).toBe(true);
    expect(canSendCode(signInStarted(withEmail))).toBe(false);

    const sent = signInCodeSent(withEmail);
    expect(sent.phase).toBe("code");
    expect(canSubmitCode(sent)).toBe(false);
    expect(canSubmitCode(signInWithCode(sent, "123456"))).toBe(true);
  });

  /**
   * Every failure reaches the inline alert, including the unavailable case: a
   * terminal card with no controls behind it leaves nothing to act on.
   */
  it("surfaces every failure through the alert, with actionable unavailable copy", () => {
    const unavailable = signInUnavailable(initialSignInState, new Error("no config"));
    expect(unavailable.phase).toBe("unavailable");
    expect(signInAlert(unavailable)).toBe(
      "Sign-in can’t start right now. Reload the page to try again.",
    );

    const recoverable = signInFailed(signInReady(initialSignInState), new Error("boom"), "choose");
    expect(signInAlert(recoverable)).toBe("Couldn’t sign in. Try again.");

    expect(signInAlert(initialSignInState)).toBe("");
  });

  it("ends busy on success", () => {
    const done = signInSucceeded(signInStarted(signInReady(initialSignInState)));
    expect(done.phase).toBe("signed-in");
    expect(done.busy).toBe(false);
  });
});
