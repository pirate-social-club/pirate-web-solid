import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { CommunityNamespaceSettingsPanel } from "./community-namespace-settings-panel";
import { createFakeNamespaceSettingsPort, hnsChangeClassification, hnsCompleteResource, namespaceIdempotencyKeys, namespaceState, unsupportedHnsRecords } from "./fake-owner-settings-port";
import type { CommunityHnsWallet } from "./community-hns-wallet";
import type { NamespaceNextAction, NamespaceSettingsSnapshot } from "./owner-settings-model";

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

export const SignOwnership: Story = {
  args: {
    ...argsFor({ kind: "sign_ownership", root_label: "midnight", message: '["pirate-hns-root-import-v1","storybook-session","midnight"]', expires_at: "2099-09-04T12:00:00.000Z" }),
    wallet: {
      isAvailable: () => true,
      publishCompleteResource: async () => undefined,
      signRootOwnership: async () => "storybook-name-signature",
    },
  },
};

export const CompleteResource: Story = {
  args: argsFor({ kind: "publish_resource", acknowledgement_required: true, replacement_semantics: "complete_resource", records: hnsCompleteResource, ...hnsChangeClassification }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Publish these 5 records to midnight/")).toBeInTheDocument();
    await expect(canvas.getByText(/Publish all of them in one wallet update/)).toBeInTheDocument();
    await expect(canvas.getAllByText("Already live")).toHaveLength(2);
    await expect(canvas.getAllByText("New")).toHaveLength(3);
    await expect(canvas.getByText("Stops being served (1)")).toBeInTheDocument();
    await expect(canvas.getByText("What is changing and why")).toBeInTheDocument();
    await expect(canvas.getByText("Already live and kept (2)")).toBeInTheDocument();
  },
};

const dankmemeRecords = [
  { record_type: "GLUE4", value: '{"address":"44.231.6.183","ns":"ns1.dankmeme.","type":"GLUE4"}', supported: true, wallet_record: { type: "GLUE4", ns: "ns1.dankmeme.", address: "44.231.6.183" } },
  { record_type: "NS", value: "ns1.pirate.", supported: true, wallet_record: { type: "NS", ns: "ns1.pirate." } },
  { record_type: "NS", value: "ns2.pirate.", supported: true, wallet_record: { type: "NS", ns: "ns2.pirate." } },
  { record_type: "TXT", value: "pirate-verification=nvs_87b0c3d842c8ea3176c4de1f7888d38907866ff80", supported: true, wallet_record: { type: "TXT", txt: ["pirate-verification=nvs_87b0c3d842c8ea3176c4de1f7888d38907866ff80"] } },
  { record_type: "DS", value: "39280 13 2 7763394f08c984b2fb71c10a8284bb7d5204a76c3a90867be3768417e27ac8e6", supported: true, wallet_record: { type: "DS", keyTag: 39280, algorithm: 13, digestType: 2, digest: "7763394f08c984b2fb71c10a8284bb7d5204a76c3a90867be3768417e27ac8e6" } },
] as const;

export const AlreadyPointedAtPirate: Story = {
  args: {
    draftRootLabel: "dankmeme",
    idempotencyKeys: namespaceIdempotencyKeys("storybook-already-pointed"),
    onCommand: fn(),
    onDraftRootLabelChange: fn(),
    snapshot: {
      community_id: "community_fixture",
      expires_at: "2099-09-08T14:31:14.000Z",
      family: "hns",
      generation: 4,
      root_label: "dankmeme",
      next_action: {
        kind: "publish_resource",
        acknowledgement_required: true,
        replacement_semantics: "complete_resource",
        records: dankmemeRecords,
        added_records: [dankmemeRecords[3]],
        preserved_records: [dankmemeRecords[0], dankmemeRecords[1], dankmemeRecords[2], dankmemeRecords[4]],
        preserved_unknown_record_types: [],
        removed_records: [
          { record_type: "TXT", value: "pirate-verification=nvs_95f773c476c84acb8a237af7ea64b96e", supported: true },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Publish these 5 records to dankmeme/")).toBeInTheDocument();
    await expect(canvas.getAllByText("Already live")).toHaveLength(4);
    await expect(canvas.getAllByText("New")).toHaveLength(1);
    await expect(canvas.getByText(/^Expires/)).toBeInTheDocument();
    await expect(canvas.getByText("Stops being served (1)")).toBeInTheDocument();
    await expect(canvas.queryByText("Key tag")).not.toBeInTheDocument();
  },
};

export const UnsupportedRecordsBlocked: Story = {
  args: argsFor({ kind: "publish_resource", acknowledgement_required: true, replacement_semantics: "complete_resource", records: unsupportedHnsRecords, ...hnsChangeClassification }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("Unsupported records");
    await expect(canvas.queryByRole("button", { name: "I published all records manually" })).not.toBeInTheDocument();
  },
};

export const ReaddedDelegationRecord: Story = {
  args: argsFor({
    kind: "publish_resource",
    acknowledgement_required: true,
    replacement_semantics: "complete_resource",
    records: hnsCompleteResource,
    added_records: hnsCompleteResource,
    preserved_records: [],
    preserved_unknown_record_types: [],
    removed_records: [hnsCompleteResource[0]],
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Stops being served (1)")).toBeInTheDocument();
    await expect(canvas.getByText("Replaced by this update (1)")).toBeInTheDocument();
    await expect(canvas.getAllByText("New")).toHaveLength(5);
    await expect(canvas.queryByText("Already live")).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "I published all records manually" })).toBeEnabled();
  },
};

export const ReadyToActivate: Story = {
  args: argsFor({
    kind: "ready_to_activate",
    app_host: "app.midnight",
    publish_plan_sha256: "a".repeat(64),
    readiness_result_sha256: "b".repeat(64),
  }),
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
    await expect(canvas.getByText((_, element) => element?.tagName === "P" && element.textContent === "Accessible at pirate.sc/c/midnight and app.midnight with Handshake.")).toBeInTheDocument();
  },
};

export const CompleteBobWalletCeremony: Story = {
  args: ConnectName.args,
  render: (args) => {
    const port = createFakeNamespaceSettingsPort();
    const [rootLabel, setRootLabel] = createSignal("dankmemes");
    const [snapshot, setSnapshot] = createSignal<NamespaceSettingsSnapshot>({
      community_id: "community_dfb78906-4859-43d6-bc92-eec33bc3b4d5",
      family: null,
      generation: 1,
      root_label: "",
      next_action: { kind: "choose_namespace" },
    });
    const wallet: CommunityHnsWallet = {
      isAvailable: () => true,
      signRootOwnership: async () => "storybook-name-signature",
      publishCompleteResource: async () => undefined,
    };
    return (
      <CommunityNamespaceSettingsPanel
        {...args}
        draftRootLabel={rootLabel()}
        idempotencyKeys={namespaceIdempotencyKeys("storybook-complete-bob-flow")}
        onCommand={async (command) => setSnapshot(await port.execute(command))}
        onDraftRootLabelChange={setRootLabel}
        snapshot={snapshot()}
        wallet={wallet}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Start verification" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Sign ownership with Bob Wallet" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Publish to dankmemes/ with Bob Wallet" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Check status" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Check status" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Activate community address" }));
    await expect(await canvas.findByRole("heading", { name: "app.dankmemes" })).toBeInTheDocument();
  },
};


export const NoAccountImport: Story = {
  args: argsFor({ kind: "choose_namespace", no_account_import: true }),
};

export const ExistingAttachmentWithoutAccountImport: Story = {
  args: {
    ...argsFor({ kind: "choose_namespace", no_account_import: true }),
    snapshot: {
      ...namespaceState({ kind: "choose_namespace", no_account_import: true }),
      attachment: { root_label: "midnight", status: "active" },
    },
  },
};
