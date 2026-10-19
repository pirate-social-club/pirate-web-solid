/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, onCleanup } from "solid-js";

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

/**
 * How long the dialog stays locked while signing in. A provider call that
 * never settles (a wallet prompt left open, a stalled request) must not trap
 * the user, so after this the dialog can close again. Closing discards the
 * attempt: the session ignores its late result.
 */
export const SIGN_IN_LOCK_MS = 20_000;

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
  // Paper: the dialog cannot be closed while signing in. The close control
  // stays visible but disabled (ruling 2026-10-16: a phone viewer always sees
  // the way out), and Escape or an outside press leaves it open until the
  // attempt settles, which returns to a phase that can close, or until the
  // lock expires for an attempt that never settles.
  const [stalled, setStalled] = createSignal(false, { ownedWrite: true });
  let lockTimer: ReturnType<typeof setTimeout> | undefined;
  createEffect(
    () => props.session.state().phase === "working",
    (working) => {
      // Cleanups registered inside an effect run only at disposal in this
      // Solid version, so the timer is cleared here and on unmount.
      clearTimeout(lockTimer);
      setStalled(false);
      if (working) lockTimer = setTimeout(() => setStalled(true), SIGN_IN_LOCK_MS);
    },
  );
  onCleanup(() => clearTimeout(lockTimer));
  const signingIn = () => props.session.state().phase === "working" && !stalled();
  const changeOpen = (open: boolean) => {
    if (!open && signingIn()) return;
    props.onOpenChange(open);
  };

  return (
    <Modal forceMobile={props.forceMobile} onOpenChange={changeOpen} open={props.open}>
      <ModalContent
        aria-label={copy().title}
        class="max-h-[90dvh] overflow-y-auto rounded-t-[var(--radius-sheet)] border-border bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 sm:max-h-[90vh] sm:max-w-[440px] sm:rounded-[var(--radius-2xl)] sm:px-5 sm:pb-5 sm:pt-4"
        closeButtonDisabled={signingIn()}
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
