/** @jsxImportSource @solidjs/web */
import { Show, createEffect, createSignal, onCleanup } from "solid-js";
import type { JSX } from "@solidjs/web";

import {
  PrivyIdentityBootstrapRequired,
  createPrivySessionExchange,
  type OAuthProvider,
  type PrivySessionExchange,
} from "../../api/privy-session.ts";
import { fetchVerificationConfig } from "../../api/verification-config.ts";
import { Button, TextField, TextFieldDescription, TextFieldInput, TextFieldLabel, Type } from "../../design-system";

type AuthPhase = "loading" | "choose" | "email" | "code" | "register" | "working" | "signed-in" | "unavailable";

export interface SignInPanelProps {
  readonly onAuthenticated?: () => void;
  readonly class?: string;
}

function safeMessage(error: unknown): string {
  if (error instanceof PrivyIdentityBootstrapRequired) return "That identity is ready for a new Pirate account.";
  if (error instanceof Error) {
    if (error.message === "wallet_unavailable") return "No injected wallet was found in this browser.";
    if (error.message === "wallet_auth_failed") return "The wallet signature was not completed.";
    if (error.message === "session_failed") return "The session cookie could not be established. Please try again.";
  }
  return "Sign in failed safely. Please try again.";
}

function oauthRedirect(provider: OAuthProvider): string {
  const redirect = new URL("/auth/sign-in", window.location.origin);
  redirect.searchParams.set("provider", provider);
  return redirect.toString();
}

/** Shared auth surface for the shell dialog and the deep-link route. */
export function SignInPanel(props: SignInPanelProps): JSX.Element {
  const [phase, setPhase] = createSignal<AuthPhase>("loading");
  const [email, setEmail] = createSignal("");
  const [code, setCode] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal("");
  let auth: PrivySessionExchange | undefined;

  createEffect(
    () => true,
    () => {
      if (typeof window === "undefined") return;
      let active = true;
      void fetchVerificationConfig().then(async config => {
        const candidate = await createPrivySessionExchange(config);
        if (!active) {
          candidate.clear();
          return;
        }
        auth = candidate;
        const params = new URL(window.location.href).searchParams;
        const authorizationCode = params.get("code");
        const returnedStateCode = params.get("state");
        const provider = params.get("provider");
        if (
          (provider === "google" || provider === "twitter") &&
          authorizationCode !== null && returnedStateCode !== null
        ) {
          setPhase("working");
          try {
            await candidate.completeOAuth(provider, authorizationCode, returnedStateCode);
            props.onAuthenticated?.();
            if (props.onAuthenticated === undefined) setPhase("signed-in");
          } catch (error) {
            if (error instanceof PrivyIdentityBootstrapRequired) setPhase("register");
            setMessage(safeMessage(error));
          }
        } else {
          setPhase("choose");
        }
      }).catch(error => {
        if (active) {
          setMessage(safeMessage(error));
          setPhase("unavailable");
        }
      });
      onCleanup(() => {
        active = false;
        auth?.clear();
        auth = undefined;
      });
    },
  );

  async function sendCode() {
    if (auth === undefined || email().trim().length === 0) return;
    setBusy(true); setMessage("");
    try {
      await auth.sendCode(email().trim());
      setPhase("code");
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function authenticate() {
    if (auth === undefined || code().trim().length === 0) return;
    setBusy(true); setMessage("");
    try {
      await auth.loginWithCode(email().trim(), code().trim());
      props.onAuthenticated?.();
      if (props.onAuthenticated === undefined) setPhase("signed-in");
    } catch (error) {
      if (error instanceof PrivyIdentityBootstrapRequired) setPhase("register");
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    if (auth === undefined) return;
    setBusy(true); setMessage("");
    try {
      await auth.register();
      props.onAuthenticated?.();
      if (props.onAuthenticated === undefined) setPhase("signed-in");
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function beginOAuth(provider: OAuthProvider) {
    if (auth === undefined) return;
    setBusy(true); setMessage(""); setPhase("working");
    try {
      const url = await auth.beginOAuth(provider, oauthRedirect(provider));
      window.location.assign(url);
    } catch (error) {
      setPhase("choose");
      setMessage(safeMessage(error));
      setBusy(false);
    }
  }

  async function loginWithWallet() {
    if (auth === undefined) return;
    setBusy(true); setMessage(""); setPhase("working");
    try {
      await auth.loginWithWallet();
      props.onAuthenticated?.();
      if (props.onAuthenticated === undefined) setPhase("signed-in");
    } catch (error) {
      if (error instanceof PrivyIdentityBootstrapRequired) setPhase("register");
      else setPhase("choose");
      setMessage(safeMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-auth-panel class={`flex flex-col gap-5 ${props.class ?? ""}`}>
      <Show when={phase() === "loading"}><p role="status">Loading secure sign-in…</p></Show>
      <Show when={phase() === "unavailable"}><p role="alert">Sign-in is not enabled on this environment yet.</p></Show>
      <Show when={phase() === "choose"}>
        <div class="grid gap-2">
          <Button type="button" disabled={busy()} onClick={() => void beginOAuth("google")}>Continue with Google</Button>
          <Button type="button" disabled={busy()} onClick={() => void beginOAuth("twitter")}>Continue with X / Twitter</Button>
          <Button type="button" disabled={busy()} onClick={() => void loginWithWallet()}>Continue with wallet</Button>
          <Button type="button" disabled={busy()} onClick={() => { setMessage(""); setPhase("email"); }}>Continue with email</Button>
        </div>
        <Type as="p" variant="caption">Privy handles the identity ceremony; Pirate receives only a same-origin session cookie.</Type>
      </Show>
      <Show when={phase() === "email"}>
        <TextField name="email" value={email()} onChange={setEmail}>
          <TextFieldLabel>Email</TextFieldLabel>
          <TextFieldInput autocomplete="email" inputmode="email" />
          <TextFieldDescription>We’ll send a one-time code. Your browser keeps no bearer token.</TextFieldDescription>
        </TextField>
        <div class="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setPhase("choose")}>Back</Button>
          <Button type="button" disabled={busy()} onClick={() => void sendCode()}>{busy() ? "Sending…" : "Send login code"}</Button>
        </div>
      </Show>
      <Show when={phase() === "code"}>
        <TextField name="code" value={code()} onChange={setCode}>
          <TextFieldLabel>Login code</TextFieldLabel>
          <TextFieldInput autocomplete="one-time-code" inputmode="numeric" />
        </TextField>
        <div class="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setPhase("email")}>Back</Button>
          <Button type="button" disabled={busy()} onClick={() => void authenticate()}>{busy() ? "Signing in…" : "Sign in"}</Button>
        </div>
      </Show>
      <Show when={phase() === "register"}>
        <p role="status">{message() || "This is your first visit. Create your Pirate account to continue."}</p>
        <Button type="button" disabled={busy()} onClick={() => void register()}>{busy() ? "Creating account…" : "Create Pirate account"}</Button>
      </Show>
      <Show when={phase() === "working"}><p role="status">Completing secure sign-in…</p></Show>
      <Show when={phase() === "signed-in"}>
        <p role="status">You’re signed in. Continue to the home feed.</p>
        <a class="font-semibold underline" href="/">Open home</a>
      </Show>
      <Show when={message().length > 0 && phase() !== "register"}><p role="alert">{message()}</p></Show>
    </div>
  );
}
