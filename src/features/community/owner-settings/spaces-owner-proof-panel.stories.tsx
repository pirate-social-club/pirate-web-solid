import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { createSignal } from "solid-js";
import { Button } from "@pirate/web-solid-ui";

import { SpacesOwnerProofPanel } from "./spaces-owner-proof-panel";
import type { SpacesOwnerProgress, SpacesOwnerProofApi } from "./spaces-owner-proof-api";
import { ApplicationSessionProvider, type ApplicationSessionState } from "../../shell/application-session";

const challenge = { contract: "pirate-spaces-ownership-start-v1" as const, ceremony_id: "ceremony-preview", generation: 1,
  network: "mainnet" as const, canonical_root: "yahoo", root_outpoint: `${"a".repeat(64)}:1`, root_key_hex: "b".repeat(64),
  challenge_message: "Sign this ownership message for this community and root", challenge_digest_hex: "c".repeat(64),
  expires_at: "2030-01-01T21:00:00Z", replayed: false };
const verified = { contract: "pirate-spaces-ownership-result-v1" as const, ceremony_id: "ceremony-preview", generation: 1,
  status: "verified" as const, namespace_authority_reference: "authority-preview", namespace_authority_generation: 1,
  evidence_digest_hex: "d".repeat(64), observed_at: "2026-10-13T19:00:00Z", fresh_until: "2030-01-01T21:00:00Z", replayed: false };
const candidate = { operator_assignment_id: "assignment-preview", generation: 1, network: "mainnet" as const,
  canonical_root: "yahoo", delegation_address: "bcs1pstoryexampleonly000000000000000000000000000000000000000000", replayed: false };
function progress(ceremony: SpacesOwnerProgress["ceremony"] = null,
  operator_assignment: SpacesOwnerProgress["operator_assignment"] = null): SpacesOwnerProgress {
  return { contract: "pirate-spaces-ownership-progress-v1", network: "mainnet", canonical_root: "yahoo",
    read_at: "2026-10-13T19:00:00Z", ceremony, operator_assignment };
}
const accepted = (proof_status: "fresh" | "expired" | "root_changed" | "unavailable" = "fresh") =>
  progress({ status: "verified", challenge, result: verified, proof_status });
const pending = () => progress({ status: "verification_pending", challenge, pending_poll_key: "saved-preview-poll" });
// Each real-component render gets its own server fixture; no progress lives in the story UI.
function previewApi(initial = progress(), savedRoots: string[] = [], unanswered = false): SpacesOwnerProofApi {
  let saved = initial;
  return {
    async roots() { return { items: savedRoots.map(canonical_root => ({ canonical_root })), next_cursor: null }; },
    async read({ root }) { return { ...saved, canonical_root: root }; },
    async start() {
      saved = progress({ status: "awaiting_signature", challenge });
      if (unanswered) throw new Error("Response lost after acceptance");
      return challenge;
    },
    async poll({ idempotencyKey }) {
      saved = progress({ status: "verification_pending", challenge, pending_poll_key: idempotencyKey });
      return { contract: "pirate-spaces-ownership-result-v1", ceremony_id: challenge.ceremony_id, generation: 1,
        status: "verification_pending", retry_after_seconds: 30, replayed: false };
    },
    async resume({ idempotencyKey }) {
      if (saved.ceremony?.status !== "verification_pending" || idempotencyKey !== saved.ceremony.pending_poll_key) throw new Error("Wrong pending key");
      saved = accepted(); return verified;
    },
    async assignment() { saved = { ...accepted(), operator_assignment: { ...candidate, status: "prepared", current: false } }; return { candidate }; },
    async confirmAssignment() { saved = { ...accepted(), operator_assignment: { ...candidate, status: "confirmed", current: true } }; return candidate; },
  };
}
const meta = {
  title: "Screens/Community/OwnerSettings/SpacesOwnerProof",
  component: SpacesOwnerProofPanel,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [(Story) => <main class="mx-auto min-h-screen w-full max-w-3xl bg-background p-4 text-foreground md:p-8"><Story /></main>],
  args: { communityId: "community-preview", accountId: "account-preview" },
} satisfies Meta<typeof SpacesOwnerProofPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
async function settled(canvasElement: HTMLElement) {
  await waitFor(() => expect(within(canvasElement).queryByText("Checking status…")).not.toBeInTheDocument());
}
export const StartAndCheck: Story = {
  render: args => <SpacesOwnerProofPanel {...args} api={previewApi()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await settled(canvasElement);
    await userEvent.type(canvas.getByLabelText("Spaces root"), "yahoo");
    await userEvent.click(canvas.getByRole("button", { name: "Get ownership message" })); await settled(canvasElement);
    await expect(canvas.getByText(challenge.challenge_message)).toBeInTheDocument();
    await userEvent.type(canvas.getByLabelText("Message signature (hex)"), "e".repeat(128));
    await userEvent.click(canvas.getByRole("button", { name: "Check signature" })); await settled(canvasElement);
    await expect(canvas.getByRole("button", { name: "Check saved proof" })).toBeInTheDocument();
    await expect(canvas.queryByLabelText("Message signature (hex)")).not.toBeInTheDocument();
  },
};
export const PendingReload: Story = {
  render: args => <SpacesOwnerProofPanel {...args} api={previewApi(pending(), ["yahoo"])} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await settled(canvasElement);
    await expect(canvas.getByText(challenge.challenge_message)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Check saved proof" })); await settled(canvasElement);
    await expect(canvas.getByRole("button", { name: "Check operator address" })).toBeInTheDocument();
  },
};
export const OperatorAssignment: Story = {
  render: args => <SpacesOwnerProofPanel {...args} api={previewApi(accepted(), ["yahoo"])} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await settled(canvasElement);
    await expect(canvas.queryByText(candidate.delegation_address)).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Check operator address" })); await settled(canvasElement);
    await expect(canvas.getByText(candidate.delegation_address)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Confirm this operator address" })); await settled(canvasElement);
    await expect(canvas.getByText("Address confirmed. Delegate from your Spaces wallet when ready.")).toBeInTheDocument();
  },
};
export const ConfirmedReload: Story = {
  render: args => <SpacesOwnerProofPanel {...args} api={previewApi(progress(
    { status: "verified", challenge, result: verified, proof_status: "expired" }, { ...candidate, status: "confirmed", current: true }), ["yahoo"])} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await settled(canvasElement);
    await expect(canvas.getByText(candidate.delegation_address)).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Confirm this operator address" })).not.toBeInTheDocument();
  },
};
export const UnansweredStart: Story = {
  render: args => <SpacesOwnerProofPanel {...args} api={previewApi(progress(), [], true)} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await settled(canvasElement);
    await userEvent.type(canvas.getByLabelText("Spaces root"), "yahoo");
    await userEvent.click(canvas.getByRole("button", { name: "Get ownership message" })); await settled(canvasElement);
    await expect(canvas.getByText(challenge.challenge_message)).toBeInTheDocument();
  },
};
export const ExpiredProof: Story = {
  render: args => <SpacesOwnerProofPanel {...args} api={previewApi(accepted("expired"), ["yahoo"])} />,
  play: async ({ canvasElement }) => {
    await settled(canvasElement);
    await expect(within(canvasElement).getByText("Ownership proof expired. Get a new ownership message.")).toBeInTheDocument();
  },
};
export const RootChanged: Story = {
  render: args => <SpacesOwnerProofPanel {...args} api={previewApi(accepted("root_changed"), ["yahoo"])} />,
  play: async ({ canvasElement }) => {
    await settled(canvasElement);
    await expect(within(canvasElement).getByText("The root changed. Get a new ownership message.")).toBeInTheDocument();
  },
};
export const ObservationUnavailable: Story = {
  render: args => <SpacesOwnerProofPanel {...args} api={previewApi(accepted("unavailable"), ["yahoo"])} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await settled(canvasElement);
    await expect(canvas.getByText("The chain could not be checked. Refresh status to check again.")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Get ownership message" })).not.toBeInTheDocument();
  },
};
export const TwoRoots: Story = {
  render: args => <SpacesOwnerProofPanel {...args} api={previewApi(progress(), ["yahoo", "other"])} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement); await settled(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "@other" })); await settled(canvasElement);
    await expect(canvas.getByLabelText("Spaces root")).toHaveValue("other");
  },
};
function SignInReturnPanel() {
  const [session, setSession] = createSignal<ApplicationSessionState>("anonymous");
  return <ApplicationSessionProvider state={session}>
    <SpacesOwnerProofPanel communityId="community-preview" api={previewApi(pending(), ["yahoo"])} />
    <Button type="button" onClick={() => setSession({ status: "authenticated", userId: "account-preview" })}>Return after sign-in</Button>
  </ApplicationSessionProvider>;
}
export const SignInReturn: Story = {
  render: () => <SignInReturnPanel />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Sign in required")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Return after sign-in" })); await settled(canvasElement);
    await expect(canvas.getByRole("button", { name: "Check saved proof" })).toBeInTheDocument();
  },
};
