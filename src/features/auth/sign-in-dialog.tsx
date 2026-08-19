/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../design-system";
import { SignInPanel } from "./sign-in-panel.tsx";

export interface SignInDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAuthenticated?: () => void;
}

export function SignInDialog(props: SignInDialogProps): JSX.Element {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign in to Pirate</DialogTitle>
          <DialogDescription>Choose an identity method to enter the community.</DialogDescription>
        </DialogHeader>
        <Show when={props.open}>
          <SignInPanel onAuthenticated={props.onAuthenticated} />
        </Show>
      </DialogContent>
    </Dialog>
  );
}
