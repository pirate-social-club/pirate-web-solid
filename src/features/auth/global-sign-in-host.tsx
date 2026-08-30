/** @jsxImportSource @solidjs/web */
import { createEffect, createSignal, onCleanup } from "solid-js";

import { SignInModal } from "./sign-in-modal.tsx";
import { createSignInSession } from "./sign-in-session.ts";

export const GLOBAL_SIGN_IN_EVENT = "pirate:connect";

/** Opens the app-owned sign-in ceremony from a route that is not inside MediaShell. */
export function requestGlobalSignIn(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(GLOBAL_SIGN_IN_EVENT));
  }
}

export interface GlobalSignInHostProps {
  readonly reload?: () => void;
}

/**
 * Owns the one app-level listener for route-local authentication prompts.
 * Reloading after success lets every protected route re-read the HttpOnly
 * session through its existing controller instead of duplicating auth state.
 */
export function GlobalSignInHost(props: GlobalSignInHostProps = {}) {
  const [open, setOpen] = createSignal(false);
  const completeAuthentication = () => {
    setOpen(false);
    if (props.reload) props.reload();
    else if (typeof window !== "undefined") window.location.reload();
  };
  const session = createSignInSession({
    enabled: open,
    onAuthenticated: completeAuthentication,
  });
  const openSignIn = () => setOpen(true);
  let listening = false;

  createEffect(
    () => true,
    () => {
      if (listening || typeof window === "undefined") return;
      listening = true;
      window.addEventListener(GLOBAL_SIGN_IN_EVENT, openSignIn);
    },
  );
  onCleanup(() => {
    if (listening && typeof window !== "undefined") {
      window.removeEventListener(GLOBAL_SIGN_IN_EVENT, openSignIn);
    }
  });

  return <SignInModal onOpenChange={setOpen} open={open()} session={session} />;
}
