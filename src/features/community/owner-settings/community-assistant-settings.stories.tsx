import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { CommunityAssistantSettingsPanel } from "./community-assistant-settings-panel";
import { TELEGRAM_CONNECTED, TELEGRAM_DISCONNECTED } from "./community-telegram-fixtures";

const meta = {
  title: "Screens/Community/OwnerSettings/Assistant",
  component: CommunityAssistantSettingsPanel,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
  decorators: [(Story) => <main class="mx-auto min-h-screen w-full max-w-5xl bg-background p-4 text-foreground md:p-8"><Story /></main>],
  args: { settings: TELEGRAM_CONNECTED, models: [{ id: "provider/community-model", name: "Community model" }], voices: [{ id: "community-voice", name: "Community voice" }], onChange: fn(), onSave: fn(), onCredentialSave: fn(async () => {}), onRefreshOptions: fn() },
} satisfies Meta<typeof CommunityAssistantSettingsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Connected: Story = {};
export const MissingKeys: Story = { args: { settings: TELEGRAM_DISCONNECTED } };
export const InvalidKey: Story = { args: { settings: { ...TELEGRAM_CONNECTED, openrouter: { status: "invalid", checked_at: "2026-09-08T10:00:00.000Z" } } } };
export const Saving: Story = { args: { saving: true } };
export const ProviderError: Story = { args: { errorMessage: "Models could not be loaded. Your saved settings are still available." } };
export const Saved: Story = { args: { successMessage: "Assistant settings saved." } };
export const ReplaceKey: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("OpenRouter API key");
    await userEvent.type(input, "fixture-provider-key");
    await userEvent.click(canvas.getAllByRole("button", { name: "Check and save key" })[0]!);
    await expect(args.onCredentialSave).toHaveBeenCalledWith("openrouter", "fixture-provider-key");
    await expect(input).toHaveValue("");
  },
};
