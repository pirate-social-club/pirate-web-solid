import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { fn } from "storybook/test";
import { CommunityNamesSettingsPanel, type CommunityNamesSettingsPanelProps } from "./community-names-settings-panel";
import { NAMES_ACTIVATION_PENDING, NAMES_ACTIVE, NAMES_EMPTY, NAMES_INEFFECTIVE, NAMES_PAUSED, NAMES_READY, NAMES_REVOKED, NAMES_SUSPENDED, unavailableNames } from "./community-names-settings-fixtures";

const meta = {
  title: "Screens/Community/OwnerSettings/Names",
  component: CommunityNamesSettingsPanel,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [(Story) => <main class="mx-auto min-h-screen w-full max-w-6xl bg-background p-4 text-foreground md:p-8"><Story /></main>],
  args: { onCommand: fn(), onReviewAddress: fn(), snapshot: NAMES_READY },
} satisfies Meta<typeof CommunityNamesSettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

function InteractiveNames(props: CommunityNamesSettingsPanelProps) {
  const [snapshot, setSnapshot] = createSignal(props.snapshot);
  return <CommunityNamesSettingsPanel {...props} onCommand={(command) => {
    props.onCommand?.(command);
    setSnapshot(command.kind === "pause_names" ? NAMES_PAUSED : NAMES_ACTIVE);
  }} snapshot={snapshot()} />;
}

export const ReadyToEnable: Story = { render: (args) => <InteractiveNames {...args} /> };
export const Active: Story = { args: { snapshot: NAMES_ACTIVE }, render: (args) => <InteractiveNames {...args} /> };
export const ActivationPending: Story = { args: { snapshot: NAMES_ACTIVATION_PENDING } };
export const Revoked: Story = { args: { snapshot: NAMES_REVOKED } };
export const Suspended: Story = { args: { snapshot: NAMES_SUSPENDED } };
export const Paused: Story = { args: { snapshot: NAMES_PAUSED }, render: (args) => <InteractiveNames {...args} /> };
export const Empty: Story = { args: { snapshot: NAMES_EMPTY } };
export const NamespaceAuthorityUnavailable: Story = { args: { snapshot: unavailableNames("namespace_authority_unavailable") } };
export const DnsZoneUnavailable: Story = { args: { snapshot: unavailableNames("dns_zone_unavailable") } };
export const DnsDelegationRequired: Story = { args: { snapshot: unavailableNames("dns_delegation_required") } };
export const HostingUnavailable: Story = { args: { snapshot: NAMES_INEFFECTIVE } };
export const EnablePending: Story = { args: { busy: "enable_names" } };
export const Loading: Story = { args: { loading: true } };
export const Error: Story = { args: { errorMessage: "Community names could not be loaded." } };
