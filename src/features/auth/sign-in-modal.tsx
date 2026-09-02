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
  title: "Join Pirate",
};

/**
 * The sign-in surface as a responsive modal: a centered dialog on desktop and a
 * bottom sheet on mobile. It is controlled — the caller owns the session and
 * the open state — so stories render any phase without a Privy exchange.
 */
export function SignInModal(props: SignInModalProps): JSX.Element {
  const copy = () => signInCopy;

  return (
    <Modal forceMobile={props.forceMobile} onOpenChange={props.onOpenChange} open={props.open}>
      <ModalContent
        aria-label={copy().title}
        class="min-h-[100dvh] max-h-[100dvh] overflow-y-auto rounded-t-[var(--radius-sheet)] border-border bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 sm:min-h-0 sm:max-h-[90vh] sm:max-w-lg sm:rounded-[var(--radius-xl)] sm:px-8 sm:pb-8 sm:pt-8"
        hideCloseButton
        mobileSide="bottom"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div class="flex flex-col gap-6">
          <div class="mx-auto h-1 w-9 rounded-full bg-border sm:hidden" />

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
