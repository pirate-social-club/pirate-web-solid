import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { CommunityNamespaceSettingsPanel } from "./community-namespace-settings-panel";
import type { HnsAddState } from "./owner-settings-model";

const noAction = () => undefined;
const state = (kind: HnsAddState["kind"]) => ({ kind, rootLabel: "midnight" }) as const;

const meta = {
  title: "Screens/Community/OwnerSettings/Address/HNS Add",
  component: CommunityNamespaceSettingsPanel,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [(Story) => <main class="mx-auto max-w-5xl p-4 md:p-8"><Story /></main>],
} satisfies Meta<typeof CommunityNamespaceSettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Step1EnterName: Story = {
  args: { hnsAddState: state("enter_name"), onAction: noAction },
};

export const Step2WalletAction: Story = {
  args: { hnsAddState: state("wallet_action"), onAction: noAction },
};

export const Step2TransactionPending: Story = {
  args: { hnsAddState: state("transaction_pending"), onAction: noAction },
};

export const Step3TreeCommitmentPending: Story = {
  args: { hnsAddState: state("tree_commitment_pending"), onAction: noAction },
};

export const Step3SecureConnectionPending: Story = {
  args: { hnsAddState: state("secure_connection_pending"), onAction: noAction },
};

export const NeedsAttentionRecordsMismatch: Story = {
  args: { hnsAddState: state("records_mismatch"), onAction: noAction },
};

export const Unavailable: Story = {
  args: { hnsAddState: state("verifier_unavailable"), onAction: noAction },
};

export const Expired: Story = {
  args: { hnsAddState: state("expired"), onAction: noAction },
};

export const Step4Connected: Story = {
  args: {
    connectedName: {
      address: "https://midnight/",
      label: "midnight/",
      providerLabel: "Connected with Handshake",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "midnight/" })).toBeInTheDocument();
    await expect(canvas.getByText("Connected")).toBeInTheDocument();
  },
};
