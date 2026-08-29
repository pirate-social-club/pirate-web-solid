import { Show, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { PrivyIdentityBootstrapRequired } from "../../api/privy-session.ts";
import { SignInModal } from "./sign-in-modal.tsx";
import type { SignInSession } from "./sign-in-session.ts";
import {
  initialSignInState,
  signInCodeSent,
  signInFailed,
  signInMoved,
  signInReady,
  signInStarted,
  signInSucceeded,
  signInUnavailable,
  signInWithCode,
  signInWithEmail,
  type SignInState,
} from "./sign-in-model.ts";

/**
 * A session that drives the real phase model with no Privy exchange behind it,
 * so every story is the production view over production transitions and the
 * catalog never reaches the network.
 */
function createStubSession(initial: SignInState): SignInSession {
  const [state, setState] = createSignal(initial);
  return {
    state,
    back() {
      setState((current) => signInMoved(current, current.phase === "code" ? "email" : "choose"));
    },
    chooseMethod(method) {
      if (method === "email") {
        setState((current) => signInMoved(current, "email"));
        return;
      }
      setState((current) => signInStarted(current, "working"));
    },
    sendCode() {
      setState(signInCodeSent);
    },
    setCode(code) {
      setState((current) => signInWithCode(current, code));
    },
    setEmail(email) {
      setState((current) => signInWithEmail(current, email));
    },
    submitCode() {
      setState(signInSucceeded);
    },
  };
}

const ready = signInReady(initialSignInState);

function SignInStory(props: { forceMobile?: boolean; state?: SignInState }) {
  const [open, setOpen] = createSignal(true);
  const session = createStubSession(props.state ?? ready);

  return (
    <div class="min-h-[760px] bg-background p-6 text-foreground">
      <Show when={!open()}>
        <button onClick={() => setOpen(true)} type="button">Reopen sign-in</button>
      </Show>
      <SignInModal
        forceMobile={props.forceMobile}
        onOpenChange={setOpen}
        open={open()}
        session={session}
      />
    </div>
  );
}

const meta = {
  title: "Flows/Auth/SignIn",
  component: SignInModal,
  args: { onOpenChange: () => undefined, open: true, session: createStubSession(ready) },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof SignInModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Choose a method (desktop)",
  render: () => <SignInStory />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    for (const label of [
      "Google",
      "X",
      "Wallet",
      "Email",
    ]) {
      await expect(within(dialog).getByRole("button", { name: label })).toBeInTheDocument();
    }
  },
};

export const MobileSheet: Story = {
  name: "Choose a method (mobile sheet)",
  render: () => <SignInStory forceMobile />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    await expect(within(dialog).getByRole("button", { name: "Email" })).toBeInTheDocument();
  },
};

export const EmailStep: Story = {
  name: "Email step",
  render: () => <SignInStory />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Email" }));

    const email = within(dialog).getByRole("textbox", { name: "Email" });
    const send = within(dialog).getByRole("button", { name: "Send login code" });
    await expect(send).toBeDisabled();

    await userEvent.type(email, "operator@example.test");
    await expect(send).toBeEnabled();
    await userEvent.click(send);

    await expect(within(dialog).getByRole("textbox", { name: "Login code" })).toBeInTheDocument();
    await expect(within(dialog).getByText("Sent to operator@example.test.")).toBeInTheDocument();
  },
};

export const CodeStep: Story = {
  name: "Code step returns to email",
  render: () => <SignInStory state={signInCodeSent(emailEntered)} />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByRole("button", { name: "Sign in" })).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Back" }));
    await expect(within(dialog).getByRole("textbox", { name: "Email" })).toHaveValue("operator@example.test");
  },
};

const emailEntered = signInWithEmail(signInMoved(ready, "email"), "operator@example.test");

/**
 * A pending request must not leave the address or the way back live: editing the
 * field would make the code step name an address the controller never used, and
 * going back would strand the user until the request completed anyway.
 */
export const EmailBusy: Story = {
  name: "Email step while sending",
  render: () => <SignInStory state={signInStarted(emailEntered)} />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByRole("textbox", { name: "Email" })).toBeDisabled();
    await expect(within(dialog).getByRole("button", { name: "Back" })).toBeDisabled();
    await expect(within(dialog).getByRole("button", { name: "Send login code" })).toHaveAttribute("aria-busy", "true");
  },
};

export const CodeBusy: Story = {
  name: "Code step while signing in",
  render: () => <SignInStory state={signInStarted(signInWithCode(signInCodeSent(emailEntered), "123456"))} />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByRole("textbox", { name: "Login code" })).toBeDisabled();
    await expect(within(dialog).getByRole("button", { name: "Back" })).toBeDisabled();
    await expect(within(dialog).getByRole("button", { name: "Sign in" })).toHaveAttribute("aria-busy", "true");
  },
};

/**
 * A first visit has no account yet, but that is not a decision to put to the
 * user: the controller creates one and carries on. There is no register
 * screen, so the surface must stay on the method list rather than growing a
 * step that asks them to confirm what signing in already chose.
 */
export const FirstVisit: Story = {
  name: "First visit shows no extra step",
  render: () => (
    <SignInStory state={signInFailed(ready, new PrivyIdentityBootstrapRequired("did:privy:operator"), "choose")} />
  ),
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).queryByRole("button", { name: "Create account" })).toBeNull();
    await expect(within(dialog).getByRole("button", { name: "Email" })).toBeInTheDocument();
  },
};

/**
 * Guards the defect this lane fixed: a failed OAuth return used to leave the
 * phase on "working", pairing progress copy with a terminal error and no
 * control. The surface must land back on the method list with the error shown.
 */
export const FailedReturn: Story = {
  name: "Failed provider return recovers",
  render: () => (
    <SignInStory state={signInFailed(signInStarted(ready, "working"), new Error("boom"), "choose")} />
  ),
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).queryByText("Signing in…")).toBeNull();
    await expect(within(dialog).getByRole("button", { name: "Google" })).toBeEnabled();
    await expect(within(dialog).getByText("Couldn’t sign in. Try again.")).toBeInTheDocument();
  },
};

export const Working: Story = {
  name: "Completing a provider ceremony",
  render: () => <SignInStory state={signInStarted(ready, "working")} />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByText("Signing in…")).toBeInTheDocument();
    await expect(within(dialog).queryByRole("button", { name: "Google" })).toBeNull();
  },
};

export const Unavailable: Story = {
  name: "Unavailable",
  render: () => <SignInStory state={signInUnavailable(initialSignInState, new Error("no config"))} />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByText("Sign-in is unavailable here")).toBeInTheDocument();
  },
};

export const Loading: Story = {
  name: "Loading",
  render: () => <SignInStory state={initialSignInState} />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByText("Loading secure sign-in…")).toBeInTheDocument();
  },
};
