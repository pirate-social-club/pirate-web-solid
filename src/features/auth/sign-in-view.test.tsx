import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  initialSignInState,
  signInReady,
  type SignInState,
} from "./sign-in-model.ts";
import { SignInView } from "./sign-in-view.tsx";

const disposers: Array<() => void> = [];

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  createRoot((dispose) => {
    disposers.push(dispose);
    solidRender(ui, container);
  });
  return container;
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

function signInView(state: SignInState): JSX.Element {
  return (
    <SignInView
      onBack={vi.fn()}
      onChooseMethod={vi.fn()}
      onCodeChange={vi.fn()}
      onEmailChange={vi.fn()}
      onResendCode={vi.fn()}
      onSendCode={vi.fn()}
      onSubmitCode={vi.fn()}
      state={state}
      walletAvailable={false}
    />
  );
}

describe("sign-in declaration", () => {
  test("states the declaration on the primary action and offers no second step", () => {
    // The account-creation interstitial was removed: the same commitment is
    // made by pressing the primary control, under the notice beside it.
    const container = render(() => signInView(signInReady(initialSignInState)));

    expect(container.textContent).toContain("you confirm you are at least 16 years old");
    expect(container.querySelector("input[type='checkbox']")).toBeNull();
    expect([...container.querySelectorAll("button")]
      .some(button => button.textContent?.includes("Create account"))).toBe(false);
    expect(container.textContent).not.toContain("Finish creating your account");
  });
});
