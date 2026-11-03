import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, within } from "storybook/test";
import { CommunityTelegramSettingsPanel } from "./community-telegram-settings-panel";
import { TELEGRAM_CONNECTED, TELEGRAM_DISCONNECTED } from "./community-telegram-fixtures";

const meta = {
  title: "Screens/Community/OwnerSettings/Telegram",
  component: CommunityTelegramSettingsPanel,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [(Story) => <main class="mx-auto min-h-screen w-full max-w-5xl bg-background p-4 text-foreground md:p-8"><Story /></main>],
  args: { settings: TELEGRAM_CONNECTED, deliveries: [], studyCatalogue: { integration: TELEGRAM_CONNECTED, enabled: false, availability: "available", items: [{post_id: "fixture-song", title: "Practice song"}], next_cursor: null }, onStudyChange: fn(), onConnect: fn(async () => {}), onDisconnect: fn(), onSetup: fn(), onConfirmChannel: fn(), onRefresh: fn(), onAutomaticChange: fn(), onBackfill: fn(), onResolve: fn() },
} satisfies Meta<typeof CommunityTelegramSettingsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Connected: Story = {};
export const Disconnected: Story = { args: { settings: TELEGRAM_DISCONNECTED }, play: async ({ canvasElement }) => {
  const canvas=within(canvasElement);
  await expect(canvas.getByRole("link", {name:"Open BotFather"})).toHaveAttribute("href","https://t.me/BotFather");
  await expect(canvas.getByLabelText("Bot token")).toHaveAttribute("type","password");
  await expect(canvas.queryByRole("link", {name:"Open bot in Telegram"})).not.toBeInTheDocument();
  await expect(canvasElement.querySelector("details")).not.toHaveAttribute("open");
} };
export const Configuring: Story = { args: { settings: { ...TELEGRAM_CONNECTED, status: "configuring", channel: null, automatic_publishing: false } } };
export const ChannelSelected: Story = { args: { setup: { id: "setup-fixture", state: "selected", deep_link: null, channel_title: "Community songs", expires_at: "2026-09-08T10:10:00.000Z" } } };
export const SetupExpired: Story = { args: { setup: { id: "setup-fixture", state: "expired", deep_link: null, channel_title: null, expires_at: "2026-09-08T10:10:00.000Z" } } };
export const UncertainDelivery: Story = { args: { deliveries: [{ id: "delivery-fixture", kind: "publication", post_id: "post-fixture", state: "uncertain", attempt_count: 1, last_error: "acknowledgement_unavailable", created_at: "2026-09-08T10:00:00.000Z" }] } };
export const Loading: Story = { args: { loading: true } };
export const Error: Story = { args: { errorMessage: "Telegram settings could not be loaded. Try refreshing." } };
export const ReadOnly: Story = { args: { readOnly: true } };
export const Unavailable: Story = { args: { settings: TELEGRAM_DISCONNECTED, readOnly: true, errorMessage: "Telegram setup is unavailable. Try again later." } };
export const Refused: Story = { args: { settings: { ...TELEGRAM_CONNECTED, status: "error", channel: null }, errorMessage: "The bot could not be connected. Check its token and try again." } };
export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } }, args: {settings: TELEGRAM_DISCONNECTED} };
export const StudyEnabled: Story = { args: {settings: {...TELEGRAM_CONNECTED, channel: null, automatic_publishing: false}, studyCatalogue: { integration: TELEGRAM_CONNECTED, enabled: true, availability: "available", items: [{post_id: "fixture-song", title: "Practice song"}], next_cursor: null }} };
export const EmptyCatalogue: Story = { args: {studyCatalogue: { integration: TELEGRAM_CONNECTED, enabled: false,availability: "available", items: [], next_cursor: null}} };
export const StudyUnavailable: Story = { args: {studyCatalogue: { integration: TELEGRAM_CONNECTED, enabled: false,availability: "unavailable", items: [], next_cursor: null}} };
