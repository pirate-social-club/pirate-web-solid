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
      setState((current) => signInMoved(current, "choose"));
    },
    chooseMethod() {
      setState((current) => signInStarted(current, "working"));
    },
    resendCode() {
      setState((current) => signInCodeSent(current));
    },
    sendCode() {
      setState((current) => signInCodeSent(current));
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
const emailEntered = signInWithEmail(ready, "operator@example.test");

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
    await expect(within(dialog).getByRole("heading", { name: "Join Pirate" })).toBeInTheDocument();
    await expect(within(dialog).getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    await expect(within(dialog).getByRole("button", { name: "Continue with X" })).toBeInTheDocument();
    await expect(within(dialog).queryByRole("button", { name: /Wallet/ })).toBeNull();
    await expect(within(dialog).getByRole("textbox", { name: "Email" })).toBeInTheDocument();
    await expect(within(dialog).getByRole("button", { name: "Continue with email" })).toBeEnabled();
  },
};

export const MobileSheet: Story = {
  name: "Choose a method (mobile sheet)",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  render: () => <SignInStory forceMobile />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByRole("heading", { name: "Join Pirate" })).toBeInTheDocument();
    await expect(within(dialog).getByText("Share music. Find your people.")).toBeInTheDocument();
    await expect(within(dialog).getByText(/By continuing, you agree to the/)).toBeInTheDocument();
  },
};

export const InlineEmailStep: Story = {
  name: "Email continues from the choose screen",
  render: () => <SignInStory />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    const email = within(dialog).getByRole("textbox", { name: "Email" });
    const send = within(dialog).getByRole("button", { name: "Continue with email" });
    await expect(send).toBeEnabled();

    await userEvent.type(email, "operator@example.test");
    await expect(send).toBeEnabled();
    await userEvent.click(send);

    await expect(within(dialog).getByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    await expect(within(dialog).getByText("Code sent to operator@example.test")).toBeInTheDocument();
    await expect(within(dialog).getByRole("group", { name: "Verification code" })).toBeInTheDocument();
  },
};

export const CodeStep: Story = {
  name: "Code step returns to choose",
  render: () => <SignInStory state={signInWithCode(signInCodeSent(emailEntered), "48")} />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByRole("button", { name: "Verify and continue" })).toBeDisabled();
    await expect(within(dialog).getAllByRole("textbox")).toHaveLength(6);
    await expect(within(dialog).getByRole("button", { name: /Resend code/ })).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Back" }));
    await expect(within(dialog).getByRole("heading", { name: "Join Pirate" })).toBeInTheDocument();
    await expect(within(dialog).getByRole("textbox", { name: "Email" })).toHaveValue("operator@example.test");
  },
};

export const EmailBusy: Story = {
  name: "Email request while sending",
  render: () => <SignInStory state={signInStarted(emailEntered)} />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByRole("textbox", { name: "Email" })).toBeDisabled();
    await expect(within(dialog).getByRole("button", { name: "Continue with Google" })).toBeDisabled();
    await expect(dialog.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  },
};

export const CodeBusy: Story = {
  name: "Code step while signing in",
  render: () => <SignInStory state={signInStarted(signInWithCode(signInCodeSent(emailEntered), "123456"))} />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getAllByRole("textbox")).toHaveLength(6);
    await expect(within(dialog).getAllByRole("textbox")[0]).toBeDisabled();
    await expect(within(dialog).getByRole("button", { name: "Back" })).toBeDisabled();
    await expect(dialog.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  },
};

/**
 * A first visit has no account yet, but that is not a decision to put to the
 * user: the controller creates one and carries on. There is no register
 * screen, so the surface stays on the method list.
 */
export const FirstVisit: Story = {
  name: "First visit shows no extra step",
  render: () => (
    <SignInStory state={signInFailed(ready, new PrivyIdentityBootstrapRequired("did:privy:operator"), "choose")} />
  ),
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).queryByRole("button", { name: "Create account" })).toBeNull();
    await expect(within(dialog).queryByRole("button", { name: /Wallet/ })).toBeNull();
    await expect(within(dialog).getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  },
};

/**
 * Guards the defect this lane fixed: a failed OAuth return used to leave the
 * phase on "working", pairing progress copy with a terminal error and no
 * control. The surface lands back on the method list with the error shown.
 */
export const FailedReturn: Story = {
  name: "Failed provider return recovers",
  render: () => (
    <SignInStory state={signInFailed(signInStarted(ready, "working"), new Error("boom"), "choose")} />
  ),
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).queryByText("Signing in…")).toBeNull();
    await expect(within(dialog).getByRole("button", { name: "Continue with Google" })).toBeEnabled();
    await expect(within(dialog).getByText("Couldn’t sign in. Try again.")).toBeInTheDocument();
  },
};

export const Working: Story = {
  name: "OAuth handoff in progress (transient)",
  render: () => <SignInStory state={signInStarted(ready, "working")} />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByText("Signing in…")).toBeInTheDocument();
    await expect(within(dialog).queryByRole("button", { name: "Continue with Google" })).toBeNull();
  },
};

export const Unavailable: Story = {
  name: "Unavailable",
  render: () => <SignInStory state={signInUnavailable(initialSignInState, new Error("no config"))} />,
  play: async () => {
    const dialog = await within(document.body).findByRole("dialog");
    await expect(within(dialog).getByText("Sign-in can’t start right now. Reload the page to try again.")).toBeInTheDocument();
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
