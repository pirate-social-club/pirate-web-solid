import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { CommunityNamespaceSettingsPanel } from "./community-namespace-settings-panel";
import { hnsCompleteResource, namespaceIdempotencyKeys, namespaceState, unsupportedHnsRecords } from "./fake-owner-settings-port";
import type { NamespaceNextAction } from "./owner-settings-model";

function argsFor(nextAction: NamespaceNextAction) {
  return {
    draftRootLabel: "midnight",
    idempotencyKeys: namespaceIdempotencyKeys(`storybook-${nextAction.kind}`),
    onCommand: fn(),
    onDraftRootLabelChange: fn(),
    snapshot: namespaceState(nextAction),
  };
}

const meta = {
  title: "Screens/Community/OwnerSettings/Address/HNS Add",
  component: CommunityNamespaceSettingsPanel,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [(Story) => <main class="mx-auto max-w-5xl p-4 md:p-8"><Story /></main>],
} satisfies Meta<typeof CommunityNamespaceSettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConnectName: Story = {
  args: {
    draftRootLabel: "midnight",
    idempotencyKeys: namespaceIdempotencyKeys("storybook-connect-name"),
    onCommand: fn(),
    onDraftRootLabelChange: fn(),
    snapshot: { community_id: "community_fixture", family: null, generation: 1, root_label: "", next_action: { kind: "choose_namespace" } },
  },
  render: (args) => {
    const [rootLabel, setRootLabel] = createSignal(args.draftRootLabel);
    return <CommunityNamespaceSettingsPanel {...args} draftRootLabel={rootLabel()} onDraftRootLabelChange={setRootLabel} />;
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    const expectedCommand = expect.objectContaining({
      expected_generation: 1,
      family: "hns",
      idempotency_key: "storybook-connect-name-select-namespace",
      kind: "select_namespace",
      root_label: "midnight",
    });
    await expect(args.onCommand).toHaveBeenNthCalledWith(1, expectedCommand);
    await expect(args.onCommand).toHaveBeenNthCalledWith(2, expectedCommand);
  },
};

export const ReadyToVerify: Story = {
  args: argsFor({ kind: "start_verification", family: "hns", root_label: "midnight" }),
};

export const CompleteResource: Story = {
  args: argsFor({ kind: "publish_resource", acknowledgement_required: true, replacement_semantics: "complete_resource", records: hnsCompleteResource }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Publish this complete resource")).toBeInTheDocument();
    await expect(canvas.getByText(/replaces the complete resource/)).toBeInTheDocument();
    await expect(canvas.getAllByText("DS")).toHaveLength(2);
  },
};

export const UnsupportedRecordsBlocked: Story = {
  args: argsFor({ kind: "publish_resource", acknowledgement_required: true, replacement_semantics: "complete_resource", records: unsupportedHnsRecords }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("Unsupported records");
    await expect(canvas.queryByRole("button", { name: "I published all records, check the chain" })).not.toBeInTheDocument();
  },
};

export const CheckingRecords: Story = {
  args: argsFor({ kind: "wait", reason_code: "verification_pending", retry_after_seconds: 5 }),
};

export const VerifierUnavailable: Story = {
  args: argsFor({ kind: "wait", reason_code: "provider_unavailable", retry_after_seconds: 30 }),
};

export const TreeCommitmentPending: Story = {
  args: argsFor({ kind: "wait", reason_code: "tree_commitment_pending", retry_after_seconds: 600 }),
};

export const DelegationInsecure: Story = {
  args: argsFor({ kind: "wait", reason_code: "delegation_insecure", retry_after_seconds: 60 }),
};

export const TxtMismatch: Story = {
  args: argsFor({ kind: "repair", reason_code: "challenge_mismatch", missing_records: [hnsCompleteResource[2]] }),
};

export const ResourceMismatch: Story = {
  args: argsFor({
    kind: "repair",
    reason_code: "resource_mismatch",
    missing_records: [hnsCompleteResource[3]],
    unexpected_records: [{ record_type: "NS", value: "old-nameserver.invalid.", supported: true }],
  }),
};

export const DnssecFailure: Story = {
  args: argsFor({ kind: "repair", reason_code: "dnssec_failure" }),
};

export const DelegationFailure: Story = {
  args: argsFor({ kind: "repair", reason_code: "delegation_failure" }),
};

export const Failed: Story = {
  args: argsFor({ kind: "failed", reason_code: "ownership_proof_rejected", retryable: true }),
};

export const Expired: Story = {
  args: argsFor({ kind: "expired" }),
};

export const Connected: Story = {
  args: argsFor({
    kind: "verified",
    canonical_route: "https://app.midnight/",
    canonical_route_label: "app.midnight",
    fallback_route: "https://pirate.sc/c/midnight",
    fallback_route_label: "pirate.sc/c/midnight",
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "app.midnight" })).toBeInTheDocument();
    await expect(canvas.getByText(/Accessible at pirate\.sc\/c\/midnight and app\.midnight with Handshake\./)).toBeInTheDocument();
  },
};
