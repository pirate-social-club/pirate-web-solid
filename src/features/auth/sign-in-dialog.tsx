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
      <DialogContent class="gap-0 overflow-hidden p-0 sm:w-[min(100%-2rem,30rem)]">
        <DialogHeader class="border-b border-border-soft bg-black px-6 py-7 pe-16 text-white">
          <div class="mb-4 flex items-center gap-3">
            <span aria-hidden="true" class="grid size-10 place-items-center rounded-full border border-white/25 bg-white/10 font-display text-sm font-semibold">P</span>
            <span class="font-display text-sm font-semibold tracking-[0.24em] text-white/70">PIRATE</span>
          </div>
          <DialogTitle class="text-2xl text-white">Sign in to Pirate</DialogTitle>
          <DialogDescription class="mt-2 text-white/65">Bring your identity into the community and keep your session private to this device.</DialogDescription>
        </DialogHeader>
        <Show when={props.open}>
          <div class="p-6 pt-5">
            <SignInPanel onAuthenticated={props.onAuthenticated} />
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
}
