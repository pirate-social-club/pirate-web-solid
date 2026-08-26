/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";

import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle,
  PirateBrandMark,
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

const registerCopy = {
  title: "Create your Pirate account",
  description: "One more step. Your identity is verified; this creates the account it belongs to.",
};

const signInCopy = {
  title: "Sign in to Pirate",
  description: "Bring your identity into the community and keep your session private to this device.",
};

/**
 * The sign-in surface as a responsive modal: a centered dialog on desktop and a
 * bottom sheet on mobile. It is controlled — the caller owns the session and
 * the open state — so stories render any phase without a Privy exchange.
 */
export function SignInModal(props: SignInModalProps): JSX.Element {
  const copy = () => (props.session.state().phase === "register" ? registerCopy : signInCopy);

  return (
    <Modal forceMobile={props.forceMobile} onOpenChange={props.onOpenChange} open={props.open}>
      <ModalContent
        class="flex max-h-[90vh] flex-col overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 sm:max-w-lg sm:px-8 sm:pb-8 sm:pt-8"
        mobileSide="bottom"
      >
        <div class="contents">
          <ModalHeader class="space-y-5 pe-10 text-start">
            <div class="flex items-center gap-4">
              <PirateBrandMark class="size-12 shrink-0" />
              <ModalTitle class="min-w-0" leading="tight" variant="h2">
                {copy().title}
              </ModalTitle>
            </div>
            <ModalDescription class="w-full" leading="roomy" variant="caption">
              {copy().description}
            </ModalDescription>
          </ModalHeader>

          <SignInView
            class="mt-8"
            onBack={props.session.back}
            onChooseMethod={props.session.chooseMethod}
            onCodeChange={props.session.setCode}
            onEmailChange={props.session.setEmail}
            onRegister={props.session.register}
            onSendCode={props.session.sendCode}
            onSubmitCode={props.session.submitCode}
            state={props.session.state()}
          />
        </div>
      </ModalContent>
    </Modal>
  );
}
