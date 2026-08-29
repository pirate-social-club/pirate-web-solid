/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";

import { SignInView } from "./sign-in-view.tsx";
import { createSignInSession } from "./sign-in-session.ts";

export interface SignInPanelProps {
  readonly class?: string;
  readonly onAuthenticated?: () => void;
}

/**
 * The sign-in surface without a modal frame, for the /auth/sign-in deep link.
 * It wires its own session; sign-in-modal.tsx renders the same view from a
 * session the shell owns.
 */
export function SignInPanel(props: SignInPanelProps): JSX.Element {
  const session = createSignInSession({ onAuthenticated: () => props.onAuthenticated?.() });

  return (
    <SignInView
      class={props.class}
      onBack={session.back}
      onChooseMethod={session.chooseMethod}
      onCodeChange={session.setCode}
      onEmailChange={session.setEmail}
      onSendCode={session.sendCode}
      onSubmitCode={session.submitCode}
      state={session.state()}
    />
  );
}
