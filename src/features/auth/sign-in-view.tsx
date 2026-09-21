/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { For, Show } from "solid-js";

import {
  Button,
  FormNote,
  IconArrowLeft,
  IconButton,
  InputOTP,
  Skeleton,
  Spinner,
  TextField,
  TextFieldInput,
  TextFieldLabel,
  Type,
  buttonVariants,
  cn,
} from "../../design-system";
import { SignInMethodMark } from "./sign-in-method-mark.tsx";
import {
  SIGN_IN_CODE_LENGTH,
  SIGN_IN_METHODS,
  canSubmitCode,
  signInAlert,
  type SignInMethod,
  type SignInState,
} from "./sign-in-model.ts";

const methodLabel = {
  google: "Continue with Google",
  twitter: "Continue with X",
  wallet: "Connect wallet",
} satisfies Record<SignInMethod, string>;

export interface SignInViewProps {
  readonly class?: string;
  readonly state: SignInState;
  readonly walletAvailable: boolean;
  readonly onBack: () => void;
  readonly onChooseMethod: (method: SignInMethod) => void;
  readonly onCodeChange: (code: string) => void;
  readonly onEmailChange: (email: string) => void;
  readonly onResendCode: () => void;
  readonly onSendCode: () => void;
  readonly onSubmitCode: () => void;
}

function AuthBrandMark(): JSX.Element {
  return (
    <span
      aria-hidden="true"
      class="grid size-10 place-items-center rounded-full border border-border-soft bg-muted text-base font-medium text-foreground"
    >
      P
    </span>
  );
}

function ChooseHeader(): JSX.Element {
  return (
    <div class="flex flex-col items-center text-center">
      <AuthBrandMark />
      <Type as="h1" variant="h2" class="mt-3 leading-7">Join Pirate</Type>
      <Type as="p" variant="caption" class="mt-1 text-sm leading-5">
        Share music. Find your people.
      </Type>
    </div>
  );
}

/**
 * Controlled presentation for every sign-in phase. It owns no Privy handle
 * and starts no network work, so stories and tests render a phase by passing
 * state. The identity ceremony lives in createSignInSession.
 */
export function SignInView(props: SignInViewProps): JSX.Element {
  const phase = () => props.state.phase;
  const alert = () => signInAlert(props.state);
  const methods = () => SIGN_IN_METHODS.filter(
    (method) => method !== "wallet" || props.walletAvailable,
  );

  return (
    <div class={cn("flex flex-col", props.class)} data-auth-panel>
      <Show when={phase() === "loading"}>
        <div class="flex flex-col gap-3" role="status">
          <Skeleton class="h-3 w-28 rounded-full" />
          <Skeleton class="h-3 w-48 rounded-full" />
          <span class="sr-only">Loading secure sign-in…</span>
        </div>
      </Show>

      <Show when={phase() === "choose" || phase() === "unavailable"}>
        <div class="flex flex-col">
          <ChooseHeader />

          <div class="mt-5 flex flex-col gap-2.5">
            <For each={methods()}>
              {(method) => (
                <Button
                  class="h-12 w-full text-sm font-medium hover:bg-card/85"
                  disabled={props.state.busy || phase() === "unavailable"}
                  leadingIcon={<SignInMethodMark method={method} />}
                  onClick={() => props.onChooseMethod(method)}
                  variant="outline"
                >
                  {methodLabel[method]}
                </Button>
              )}
            </For>
            <Show when={props.walletAvailable}>
              <Type as="p" variant="caption" class="px-2 text-center text-xs leading-4">
                Your login wallet stays separate from your Pirate persona wallet.
              </Type>
            </Show>
          </div>

          <div class="mt-6 flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
            <span class="h-px flex-1 bg-border-soft" />
            <span>or</span>
            <span class="h-px flex-1 bg-border-soft" />
          </div>

          <form
            class="mt-4 flex flex-col gap-2.5"
            onSubmit={(event) => { event.preventDefault(); props.onSendCode(); }}
          >
            <TextField disabled={props.state.busy} name="email" onChange={props.onEmailChange} value={props.state.email}>
              <TextFieldLabel class="text-sm">Email</TextFieldLabel>
              <TextFieldInput
                autocomplete="email"
                class="h-10 bg-muted text-sm"
                inputmode="email"
                placeholder="you@example.com"
                required
              />
            </TextField>
            <Button
              class="h-12 w-full text-sm font-medium"
              disabled={props.state.busy || phase() === "unavailable"}
              loading={props.state.busy}
              type="submit"
            >
              Continue with email
            </Button>
          </form>

          <Type as="p" variant="caption" class="mt-5 text-center text-xs leading-4">
            By continuing, you confirm you are at least 16 years old and agree to the <a class="text-foreground underline underline-offset-2" href="/terms">Terms</a> and <a class="text-foreground underline underline-offset-2" href="/privacy">Privacy Policy</a>.
          </Type>
        </div>
      </Show>

      <Show when={phase() === "code"}>
        <div class="flex flex-col pt-1.5">
          <IconButton aria-label="Back" class="size-10 self-start bg-muted" disabled={props.state.busy} onClick={props.onBack} variant="secondary">
            <IconArrowLeft class="size-5" />
          </IconButton>

          <div class="mt-5 flex flex-col items-center text-center">
            <Type as="h1" variant="h2" class="leading-7">Check your email</Type>
            <Type as="p" variant="caption" class="mt-1 text-sm leading-5">
              Code sent to {props.state.email}
            </Type>
          </div>

          <form
            class="mt-5 flex flex-col gap-5"
            onSubmit={(event) => { event.preventDefault(); props.onSubmitCode(); }}
          >
            <InputOTP
              aria-label="Verification code"
              autofocus
              disabled={props.state.busy}
              length={SIGN_IN_CODE_LENGTH}
              onChange={props.onCodeChange}
              value={props.state.code}
            />
            <Button class="h-12 w-full text-sm font-medium" disabled={!canSubmitCode(props.state)} loading={props.state.busy} type="submit">
              Verify and continue
            </Button>
          </form>

          <button
            class="mt-5 self-center text-sm text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
            disabled={props.state.busy}
            onClick={props.onResendCode}
            type="button"
          >
            Didn’t get it? <span class="font-semibold text-foreground">Resend code</span>
          </button>
        </div>
      </Show>

      <Show when={phase() === "working"}>
        <div class="flex items-center gap-3" role="status">
          <Spinner decorative size="sm" />
          <Type as="p" variant="body">Signing in…</Type>
        </div>
      </Show>

      <Show when={phase() === "signed-in"}>
        <Type as="p" variant="body" role="status">You’re signed in.</Type>
        <a class={cn(buttonVariants(), "h-14 w-full")} href="/">Continue</a>
      </Show>

      <Show when={alert().length > 0}>
        <div aria-live="assertive" class="mt-5" role="alert">
          <FormNote tone="destructive">{alert()}</FormNote>
        </div>
      </Show>
    </div>
  );
}
