/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";

import {
  Modal,
  ModalContent,
} from "../../design-system";
import { SignInView } from "./sign-in-view.tsx";
import type { SignInSession } from "./sign-in-session.ts";

export interface SignInModalProps {
  /** Pins the mobile branch for stories and tests. */
  readonly forceMobile?: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly session: SignInSession;
}

const signInCopy = {
  title: "Sign in",
};

/**
 * The sign-in surface as a responsive modal: a centered dialog on desktop and a
 * bottom sheet on mobile. It is controlled — the caller owns the session and
 * the open state — so stories render any phase without a Privy exchange.
 */
export function SignInModal(props: SignInModalProps): JSX.Element {
  const copy = () => signInCopy;
  // Paper: the dialog cannot be closed while signing in. The close control is
  // removed and Escape or an outside press leaves it open until the attempt
  // settles, which returns to a phase that can close.
  const signingIn = () => props.session.state().phase === "working";
  const changeOpen = (open: boolean) => {
    if (!open && signingIn()) return;
    props.onOpenChange(open);
  };

  return (
    <Modal forceMobile={props.forceMobile} onOpenChange={changeOpen} open={props.open}>
      <ModalContent
        aria-label={copy().title}
        class="max-h-[90dvh] overflow-y-auto rounded-t-[var(--radius-sheet)] border-border bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 sm:max-h-[90vh] sm:max-w-[440px] sm:rounded-[var(--radius-2xl)] sm:px-5 sm:pb-5 sm:pt-4"
        hideCloseButton={signingIn()}
        mobileSide="bottom"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div class="flex flex-col gap-6">
          <SignInView
            onBack={props.session.back}
            onChooseMethod={props.session.chooseMethod}
            onCodeChange={props.session.setCode}
            onEmailChange={props.session.setEmail}
            onResendCode={props.session.resendCode}
            onSendCode={props.session.sendCode}
            onSubmitCode={props.session.submitCode}
            state={props.session.state()}
            walletAvailable={props.session.walletAvailable()}
          />
        </div>
      </ModalContent>
    </Modal>
  );
}
