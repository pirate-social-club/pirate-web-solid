import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { CommunityNamespaceSettingsPanel } from "./community-namespace-settings-panel";
import { hnsReplacementRecords, namespaceState, unsupportedHnsRecords } from "./fake-owner-settings-port";
import type { NamespaceNextAction } from "./owner-settings-model";

const noCommand = () => undefined;
const noDraftChange = () => undefined;

function argsFor(nextAction: NamespaceNextAction) {
  return {
    draftFamily: "hns" as const,
    draftRootLabel: "infinity",
    onCommand: noCommand,
    onDraftChange: noDraftChange,
    snapshot: namespaceState(nextAction),
  };
}

const meta = {
  title: "Screens/Community/OwnerSettings/Namespace",
  component: CommunityNamespaceSettingsPanel,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [(Story) => <main class="mx-auto max-w-5xl p-4 md:p-8"><Story /></main>],
} satisfies Meta<typeof CommunityNamespaceSettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HnsImportCompleteResource: Story = {
  args: argsFor({ kind: "publish_resource", acknowledgement_required: true, replacement_semantics: "complete_resource", records: hnsReplacementRecords }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Import HNS zone" }));
    await expect(canvas.getByText("Import an existing HNS zone")).toBeInTheDocument();
    await expect(canvas.getByText("Publish this complete resource")).toBeInTheDocument();
    await expect(canvas.getByText(/replaces the complete resource/)).toBeInTheDocument();
  },
};

export const UnsupportedRecordsBlocked: Story = {
  args: argsFor({ kind: "publish_resource", acknowledgement_required: true, replacement_semantics: "complete_resource", records: unsupportedHnsRecords }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Import HNS zone" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent("Unsupported records");
    await expect(canvas.queryByRole("button", { name: "I published all records, check the chain" })).not.toBeInTheDocument();
  },
};

export const VerificationPending: Story = {
  args: argsFor({ kind: "wait", reason_code: "verification_pending", retry_after_seconds: 5 }),
};

export const VerifierUnavailable: Story = {
  args: argsFor({ kind: "wait", reason_code: "provider_unavailable", retry_after_seconds: 30 }),
};

export const PublishedResourceMismatch: Story = {
  args: argsFor({
    kind: "repair",
    reason_code: "resource_mismatch",
    missing_records: [hnsReplacementRecords[3]],
    unexpected_records: [{ record_type: "NS", value: "old-nameserver.invalid.", supported: true }],
  }),
};

export const TreeCommitmentPending: Story = {
  args: argsFor({ kind: "wait", reason_code: "tree_commitment_pending", retry_after_seconds: 600 }),
};

export const DnssecFailure: Story = {
  args: argsFor({ kind: "repair", reason_code: "dnssec_failure" }),
};

export const DelegationFailure: Story = {
  args: argsFor({ kind: "repair", reason_code: "delegation_failure" }),
};

export const Verified: Story = {
  args: argsFor({ kind: "verified", canonical_route: "https://infinity/" }),
};

export const Failed: Story = {
  args: argsFor({ kind: "failed", reason_code: "ownership_proof_rejected", retryable: true }),
};

export const Expired: Story = {
  args: argsFor({ kind: "expired" }),
};

export const SpacesReady: Story = {
  args: {
    draftFamily: "spaces",
    draftRootLabel: "infinity",
    onCommand: noCommand,
    onDraftChange: noDraftChange,
    snapshot: {
      community_id: "community_fixture",
      family: "spaces",
      generation: 2,
      root_label: "infinity",
      next_action: { kind: "start_verification", family: "spaces", root_label: "infinity" },
    },
  },
};
