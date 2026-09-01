import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { CommunityNamespaceSettingsPanel } from "./community-namespace-settings-panel";
import type { HnsAddState } from "./owner-settings-model";

const noAction = () => undefined;
const recordsState = (kind: HnsAddState["kind"]): HnsAddState => ({
  kind,
  nameservers: ["ns1.pirate.sc."],
  rootLabel: "midnight",
  txtRecord: "pirate-verification=storybook-session",
});

const meta = {
  title: "Screens/Community/OwnerSettings/Address/HNS Add",
  component: CommunityNamespaceSettingsPanel,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [(Story) => <main class="mx-auto max-w-5xl p-4 md:p-8"><Story /></main>],
} satisfies Meta<typeof CommunityNamespaceSettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ConnectName: Story = {
  args: { hnsAddState: { kind: "enter_name", rootLabel: "midnight" }, onAction: noAction },
};

export const RecordsReady: Story = {
  args: { hnsAddState: recordsState("records_ready"), onAction: noAction },
};

export const CheckingRecords: Story = {
  args: { hnsAddState: recordsState("checking_records"), onAction: noAction },
};

export const RecordsNotFound: Story = {
  args: { hnsAddState: recordsState("records_not_found"), onAction: noAction },
};

export const TxtMismatch: Story = {
  args: { hnsAddState: recordsState("txt_mismatch"), onAction: noAction },
};

export const VerifierUnavailable: Story = {
  args: { hnsAddState: recordsState("verifier_unavailable"), onAction: noAction },
};

export const Expired: Story = {
  args: { hnsAddState: recordsState("expired"), onAction: noAction },
};

export const Connected: Story = {
  args: {
    connectedName: {
      address: "https://app.midnight/",
      fallbackAddress: "https://pirate.sc/c/midnight",
      fallbackLabel: "pirate.sc/c/midnight",
      label: "app.midnight",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "app.midnight" })).toBeInTheDocument();
    await expect(canvas.getByText(/Accessible at pirate\.sc\/c\/midnight and app\.midnight with Handshake\./)).toBeInTheDocument();
  },
};
