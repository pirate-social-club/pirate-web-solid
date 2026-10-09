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

describe("sign-in terms", () => {
  test("keeps Terms and Privacy links without an age declaration", () => {
    const container = render(() => signInView(signInReady(initialSignInState)));

    expect(container.textContent).toContain("By continuing, you agree to the");
    expect(container.querySelector("a[href='/terms']")?.textContent).toBe("Terms");
    expect(container.querySelector("a[href='/privacy']")?.textContent).toBe("Privacy Policy");
    expect(container.textContent).not.toContain("16 years old");
    expect(container.querySelector("input[type='checkbox']")).toBeNull();
    expect([...container.querySelectorAll("button")]
      .some(button => button.textContent?.includes("Create account"))).toBe(false);
    expect(container.textContent).not.toContain("Finish creating your account");
  });
});
