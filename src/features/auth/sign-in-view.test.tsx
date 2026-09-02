import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  initialSignInState,
  signInReady,
  signInRegistrationRequired,
  signInWithMinimumAgeAffirmation,
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

function registrationView(state: SignInState): JSX.Element {
  return (
    <SignInView
      onBack={vi.fn()}
      onChooseMethod={vi.fn()}
      onCodeChange={vi.fn()}
      onEmailChange={vi.fn()}
      onMinimumAgeAffirmedChange={vi.fn()}
      onResendCode={vi.fn()}
      onSendCode={vi.fn()}
      onSubmitCode={vi.fn()}
      onSubmitRegistration={vi.fn()}
      state={state}
      walletAvailable={false}
    />
  );
}

describe("first-registration declaration view", () => {
  const registration = signInRegistrationRequired(signInReady(initialSignInState));

  test("starts unchecked and blocks account creation", () => {
    const container = render(() => registrationView(registration));
    const checkbox = container.querySelector<HTMLInputElement>("input[type='checkbox']");
    const submit = [...container.querySelectorAll("button")]
      .find(button => button.textContent?.includes("Create account"));

    expect(checkbox?.checked).toBe(false);
    expect(submit?.disabled).toBe(true);
    expect(container.textContent).toContain("not identity or document verification");
  });

  test("enables account creation only for the affirmed controlled state", () => {
    const affirmed = signInWithMinimumAgeAffirmation(registration, true);
    const container = render(() => registrationView(affirmed));
    const checkbox = container.querySelector<HTMLInputElement>("input[type='checkbox']");
    const submit = [...container.querySelectorAll("button")]
      .find(button => button.textContent?.includes("Create account"));

    expect(checkbox?.checked).toBe(true);
    expect(submit?.disabled).toBe(false);
  });
});
