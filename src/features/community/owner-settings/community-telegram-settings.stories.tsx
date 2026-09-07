import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { fn } from "storybook/test";
import { CommunityTelegramSettingsPanel } from "./community-telegram-settings-panel";
import { TELEGRAM_CONNECTED, TELEGRAM_DISCONNECTED } from "./community-telegram-fixtures";

const meta = {
  title: "Screens/Community/OwnerSettings/Telegram",
  component: CommunityTelegramSettingsPanel,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [(Story) => <main class="mx-auto min-h-screen w-full max-w-5xl bg-background p-4 text-foreground md:p-8"><Story /></main>],
  args: { settings: TELEGRAM_CONNECTED, deliveries: [], onConnect: fn(async () => {}), onDisconnect: fn(), onSetup: fn(), onConfirmChannel: fn(), onRefresh: fn(), onAutomaticChange: fn(), onBackfill: fn(), onResolve: fn() },
} satisfies Meta<typeof CommunityTelegramSettingsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Connected: Story = {};
export const Disconnected: Story = { args: { settings: TELEGRAM_DISCONNECTED } };
export const Configuring: Story = { args: { settings: { ...TELEGRAM_CONNECTED, status: "configuring", channel: null, automatic_publishing: false } } };
export const ChannelSelected: Story = { args: { setup: { id: "setup-fixture", state: "selected", deep_link: null, channel_title: "Community songs", expires_at: "2026-09-08T10:10:00.000Z" } } };
export const SetupExpired: Story = { args: { setup: { id: "setup-fixture", state: "expired", deep_link: null, channel_title: null, expires_at: "2026-09-08T10:10:00.000Z" } } };
export const UncertainDelivery: Story = { args: { deliveries: [{ id: "delivery-fixture", kind: "publication", post_id: "post-fixture", state: "uncertain", attempt_count: 1, last_error: "acknowledgement_unavailable", created_at: "2026-09-08T10:00:00.000Z" }] } };
export const Loading: Story = { args: { loading: true } };
export const ReadOnly: Story = { args: { readOnly: true } };
export const Error: Story = { args: { errorMessage: "Telegram settings could not be loaded. Try refreshing." } };
