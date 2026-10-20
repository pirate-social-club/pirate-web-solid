import { ApiClientError, type GetUsersMeSpacesHandleRequestsResponse } from "@pirate/api-client";
import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ApplicationSessionProvider, type ApplicationSessionState } from "../../shell/application-session.tsx";
import { SpacesMemberRequests } from "./spaces-member-requests.tsx";

type Item = GetUsersMeSpacesHandleRequestsResponse["items"][number];
const hash = "a".repeat(64), at = "2026-10-20T00:00:00.000Z";
function request(root: string, id: string): Item {
  return { kind: "claim", action: { action_id: `action-${id}`, endpoint_template: "/handle-claims", idempotency_key: `key-${id}`, request_hash: hash, committed_at: at },
    context: { community_id: `community-${id}`, offering_id: `offering-${id}`, offering_revision: 1, offering_hash: hash,
      sale_namespace_activation_id: `activation-${id}`, sale_namespace_activation_generation: 1, owner_persona_id: `persona-${id}`, namespace_root: root, network: "regtest" },
    claim: { claim_id: `claim-${id}`, offering_id: `offering-${id}`, offering_hash: hash, owner_persona_id: `persona-${id}`,
      sale_namespace_activation_id: `activation-${id}`, sale_namespace_activation_generation: 1, quote_id: `quote-${id}`,
      reservation_id: `reservation-${id}`, reservation_hash: hash, fulfillment: { kind: "spaces_native_v1" },
      handle: { family: "spaces", namespace_root: root, handle_label: "original-name" }, display_identifier: `original-name@${root}`,
      recipient: { kind: "persona_taproot_v1", network: "regtest", script_pubkey_hex: `5120${hash}` },
      payment: { kind: "not_required_v1", pricing_revision: 1, pricing_hash: hash, atomic_amount: "0", status: "not_applicable" },
      state: "issuance_pending", delayed: false, safe_reason: null, grant: null, created_at: at, updated_at: at } };
}
const refusal: Item = { kind: "quote_refusal", action: { action_id: "action-partial", endpoint_template: "/handle-quotes", idempotency_key: "partial-key", request_hash: hash, committed_at: at },
  offering_id: "offering-original", owner_persona_id: "persona-original", immutable_context: "not_recorded", result_kind: "eligibility_required", reason: "evidence_required" };
const page = (items: readonly Item[]): GetUsersMeSpacesHandleRequestsResponse => ({ object: "spaces_member_request_readback_v1",
  coverage: "retained_committed_actions_with_stored_scope", scope_incomplete_actions: "omitted_when_scope_unprovable",
  unlocated_request_outcome: "unknown", new_submission_admission: "not_established_by_readback", items, next_cursor: null });

function RecoveryStory(props: { mode?: "empty" | "partial" | "signed-out" | "failure" | "session-refused"; controls?: boolean }) {
  const [account, setAccount] = createSignal<ApplicationSessionState>(props.mode === "signed-out" ? "anonymous" : { status: "authenticated", userId: "story-account-first" });
  const [pending, setPending] = createSignal(false);
  const [reads, setReads] = createSignal(0);
  const client = { get_usersMeSpacesHandleRequests: async () => {
    setReads(reads() + 1);
    if (props.mode === "failure") throw new Error("offline story response unavailable");
    if (props.mode === "session-refused") throw new ApiClientError({ status: 401, code: "unauthorized", name: "Unauthorized", retryable: false },
      { error: { code: "unauthorized", message: "Sign in required", retryable: false } });
    const current = account();
    return page(props.mode === "empty" ? [] : props.mode === "partial" ? [refusal]
      : [request(typeof current === "object" && current.userId === "story-account-second" ? "second-root" : "first-root", "original")]);
  } };
  return <ApplicationSessionProvider state={account} pending={pending}>
    <SpacesMemberRequests client={client} />
    <div class="mx-auto max-w-2xl px-4 pb-4">
      <output aria-label="Readback requests">{reads()}</output>
      {props.controls && <div class="flex flex-wrap gap-3">
        <button onClick={() => setPending(true)}>Begin session check</button>
        <button onClick={() => { setAccount({ status: "authenticated", userId: "story-account-second" }); setPending(false); }}>Use second account</button>
        <button onClick={() => setAccount("anonymous")}>End test session</button>
      </div>}
    </div>
  </ApplicationSessionProvider>;
}
const meta = { title: "Screens/Community/SpacesMemberRequests", component: SpacesMemberRequests,
  parameters: { layout: "fullscreen", a11y: { test: "error" } } } satisfies Meta<typeof SpacesMemberRequests>;
export default meta;
type Story = StoryObj<typeof meta>;
export const OriginalRequest: Story = { render: () => <RecoveryStory /> };
export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } }, render: () => <RecoveryStory /> };
export const PartialScope: Story = { render: () => <RecoveryStory mode="partial" /> };
export const Unavailable: Story = { render: () => <RecoveryStory mode="failure" /> };
export const SignedOut: Story = { render: () => <RecoveryStory mode="signed-out" /> };
export const CachedSessionRefused: Story = {
  render: () => <RecoveryStory mode="session-refused" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Sign in to see your requests.");
    expect(canvas.queryByRole("button", { name: "Retry original request" })).toBeNull();
    expect(canvas.queryByRole("button", { name: "Check requests" })).toBeNull();
  },
};
export const UnknownAndSafeCheck: Story = {
  render: () => <RecoveryStory mode="empty" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("The earlier outcome is unknown. Check again safely.");
    expect(canvas.queryByRole("button", { name: "Retry original request" })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Check requests" }));
    await waitFor(() => expect(canvas.getByLabelText("Readback requests")).toHaveTextContent("2"));
  },
};
export const SessionChange: Story = {
  render: () => <RecoveryStory controls />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Original root: @first-root · Network: regtest");
    await userEvent.click(canvas.getByRole("button", { name: "Begin session check" }));
    await waitFor(() => expect(canvas.queryByText(/@first-root/u)).toBeNull());
    await userEvent.click(canvas.getByRole("button", { name: "Use second account" }));
    await canvas.findByText("Original root: @second-root · Network: regtest");
    await userEvent.click(canvas.getByRole("button", { name: "End test session" }));
    await canvas.findByText("Sign in to see your requests.");
    expect(canvas.queryByText(/@second-root/u)).toBeNull();
  },
};
