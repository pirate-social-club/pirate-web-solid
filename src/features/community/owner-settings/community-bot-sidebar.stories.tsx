import { createSignal, Show } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { CommunityOwnerSettingsShell } from "./community-owner-settings-shell";
import { CommunityAssistantSettingsPanel } from "./community-assistant-settings-panel";
import { CommunityTelegramSettingsPanel } from "./community-telegram-settings-panel";
import { TELEGRAM_CONNECTED } from "./community-telegram-fixtures";
import type { OwnerSettingsSection } from "./owner-settings-model";

function CommunityBotSidebar() {
  const [section, setSection] = createSignal<OwnerSettingsSection>("telegram");
  const [settings, setSettings] = createSignal(TELEGRAM_CONNECTED);
  return <CommunityOwnerSettingsShell access={{ "community.bot.manage": true }} activeSection={section()} communityName="Community" onSectionChange={setSection}>
    <Show when={section() === "assistant"} fallback={<CommunityTelegramSettingsPanel showHeading={false} settings={settings()} deliveries={[]} onConnect={async () => {}} onDisconnect={() => {}} onSetup={() => {}} onConfirmChannel={() => {}} onRefresh={() => {}} onAutomaticChange={() => {}} onBackfill={() => {}} onResolve={() => {}} />}>
      <CommunityAssistantSettingsPanel showHeading={false} settings={settings()} models={[]} voices={[]} onChange={(assistant) => setSettings({ ...settings(), assistant })} onSave={() => {}} onCredentialSave={async () => {}} onRefreshOptions={() => {}} />
    </Show>
  </CommunityOwnerSettingsShell>;
}

const meta = {
  title: "Screens/Community/OwnerSettings/BotSidebar",
  component: CommunityBotSidebar,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof CommunityBotSidebar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ModerationNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Assistant" }));
    await expect(canvas.getByLabelText("OpenRouter API key")).toBeInTheDocument();
    await expect(canvas.getByLabelText("ElevenLabs API key")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Telegram" }));
    await expect(canvas.getByRole("heading", { name: "Telegram" })).toBeInTheDocument();
  },
};
