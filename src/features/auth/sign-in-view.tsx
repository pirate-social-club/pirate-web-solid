/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import {
  Button,
  FormNote,
  Skeleton,
  TextField,
  TextFieldDescription,
  TextFieldInput,
  TextFieldLabel,
  Type,
  buttonVariants,
  cn,
} from "../../design-system";
import { SignInMethodMark } from "./sign-in-method-mark.tsx";
import {
  SIGN_IN_METHODS,
  canSendCode,
  canSubmitCode,
  signInAlert,
  type SignInMethod,
  type SignInState,
} from "./sign-in-model.ts";

const methodLabel = {
  google: "Google",
  twitter: "X",
  wallet: "Wallet",
  email: "Email",
} satisfies Record<SignInMethod, string>;

export interface SignInViewProps {
  readonly class?: string;
  readonly state: SignInState;
  readonly onBack: () => void;
  readonly onChooseMethod: (method: SignInMethod) => void;
  readonly onCodeChange: (code: string) => void;
  readonly onEmailChange: (email: string) => void;
  readonly onRegister: () => void;
  readonly onSendCode: () => void;
  readonly onSubmitCode: () => void;
}

/**
 * Controlled presentation for every sign-in phase. It owns no Privy handle and
 * starts no network work, so stories and tests render a phase by passing state.
 * The identity ceremony lives in createSignInSession.
 */
export function SignInView(props: SignInViewProps): JSX.Element {
  const phase = () => props.state.phase;
  const alert = () => signInAlert(props.state);

  return (
    <div class={cn("flex flex-col gap-6", props.class)} data-auth-panel>
      <Show when={phase() === "loading"}>
        <div class="flex flex-col gap-3" role="status">
          <Skeleton class="h-3 w-28 rounded-full" />
          <Skeleton class="h-3 w-48 rounded-full" />
          <span class="sr-only">Loading secure sign-in…</span>
        </div>
      </Show>

      <Show when={phase() === "unavailable"}>
        <div class="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-border-soft bg-muted/30 p-4" role="alert">
          <Type as="p" variant="body-strong">Sign-in is unavailable here</Type>
          <FormNote>{props.state.message}</FormNote>
        </div>
      </Show>

      <Show when={phase() === "choose"}>
        <div class="flex flex-col gap-2.5">
          <For each={SIGN_IN_METHODS}>
            {(method) => (
              <Button
                class="h-14 w-full justify-start"
                disabled={props.state.busy}
                leadingIcon={<SignInMethodMark method={method} />}
                onClick={() => props.onChooseMethod(method)}
                variant="outline"
              >
                {methodLabel[method]}
              </Button>
            )}
          </For>
        </div>
      </Show>

      <Show when={phase() === "email"}>
        <form class="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); props.onSendCode(); }}>
          <TextField disabled={props.state.busy} name="email" onChange={props.onEmailChange} value={props.state.email}>
            <TextFieldLabel>Email</TextFieldLabel>
            <TextFieldInput autocomplete="email" inputmode="email" />
            <TextFieldDescription>We’ll send a one-time code.</TextFieldDescription>
          </TextField>
          <div class="flex flex-col gap-2">
            <Button class="h-14 w-full" disabled={!canSendCode(props.state)} loading={props.state.busy} type="submit">
              Send login code
            </Button>
            <Button class="h-14 w-full" disabled={props.state.busy} onClick={props.onBack} variant="ghost">Back</Button>
          </div>
        </form>
      </Show>

      <Show when={phase() === "code"}>
        <form class="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); props.onSubmitCode(); }}>
          <TextField disabled={props.state.busy} name="code" onChange={props.onCodeChange} value={props.state.code}>
            <TextFieldLabel>Login code</TextFieldLabel>
            <TextFieldInput autocomplete="one-time-code" inputmode="numeric" />
            <TextFieldDescription>Sent to {props.state.email}.</TextFieldDescription>
          </TextField>
          <div class="flex flex-col gap-2">
            <Button class="h-14 w-full" disabled={!canSubmitCode(props.state)} loading={props.state.busy} type="submit">
              Sign in
            </Button>
            <Button class="h-14 w-full" disabled={props.state.busy} onClick={props.onBack} variant="ghost">Back</Button>
          </div>
        </form>
      </Show>

      <Show when={phase() === "register"}>
        <Type as="p" variant="body" role="status">
          {props.state.message || "Create an account to continue."}
        </Type>
        <Button class="h-14 w-full" loading={props.state.busy} onClick={props.onRegister}>
          Create account
        </Button>
      </Show>

      <Show when={phase() === "working"}>
        <Type as="p" variant="body" role="status">Signing in…</Type>
      </Show>

      <Show when={phase() === "signed-in"}>
        <Type as="p" variant="body" role="status">You’re signed in.</Type>
        <a class={cn(buttonVariants(), "h-14 w-full")} href="/">Continue</a>
      </Show>

      <Show when={alert().length > 0}>
        <div aria-live="assertive" role="alert">
          <FormNote tone="destructive">{alert()}</FormNote>
        </div>
      </Show>
    </div>
  );
}
