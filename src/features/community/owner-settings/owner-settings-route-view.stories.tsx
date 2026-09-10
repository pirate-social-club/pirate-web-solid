import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, waitFor, within } from "storybook/test";
import type { GetCommunitiesCommunityIdTelegramResponse } from "@pirate/api-client";

import type { OwnerSettingsRouteState } from "./owner-settings-route-model";
import type { OwnerSettingsAccess } from "./owner-settings-model";
import type { CommunityTelegramSettingsApi } from "./community-telegram-settings-api";
import { OwnerSettingsRouteView } from "./owner-settings-route-view";

/** Production access derives only from the moderation, names and Telegram reads. */
const productionAccess: OwnerSettingsAccess = {
  "community.moderation.manage": true,
  "community.names.manage": true,
};

function successState(
  access: OwnerSettingsAccess = productionAccess,
): OwnerSettingsRouteState {
  return {
    kind: "success",
    access,
    avatarUrl: null,
    communityId: "community-harbor",
    communityName: "Harbor",
    communityPath: "/c/harbor",
  };
}

const disconnectedTelegram: GetCommunitiesCommunityIdTelegramResponse = {
  community_id: "community-harbor",
  revision: 1,
  status: "disconnected",
  bot_username: null,
  channel: null,
  automatic_publishing: false,
  assistant: {
    enabled: false,
    model: "",
    instructions: "",
    voice_enabled: false,
    voice_id: "",
    voice_model: "",
    voice_reply_mode: "match_input",
    user_daily_messages: 0,
    community_daily_messages: 0,
    daily_speech_characters: 0,
    remember_conversations: false,
  },
  openrouter: { status: "missing", checked_at: null },
  elevenlabs: { status: "missing", checked_at: null },
  last_error: null,
};

const grantedProbe: Pick<CommunityTelegramSettingsApi, "getSettings"> = {
  getSettings: async () => disconnectedTelegram,
};

const unavailableProbe: Pick<CommunityTelegramSettingsApi, "getSettings"> = {
  getSettings: async () => {
    throw new Error("bot probe unreachable");
  },
};

const meta = {
  title: "Screens/Community/OwnerSettingsRoute",
  component: OwnerSettingsRouteView,
  args: {
    navigate: () => undefined,
    requestedSection: null,
    botProbeApi: grantedProbe,
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof OwnerSettingsRouteView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `/c/<segment>/settings` while the route state is still loading. */
export const Loading: Story = {
  args: { state: new Promise<OwnerSettingsRouteState>(() => {}) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("Loading community settings…");
  },
};

/** The three-read loader could not establish owner access. */
export const Denied: Story = {
  args: { state: { kind: "denied" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Owner access required" })).toBeInTheDocument();
    await expect(canvasElement.querySelector("[data-owner-settings-route-state]")?.getAttribute("data-owner-settings-route-state")).toBe("denied");
  },
};

export const NotFound: Story = {
  args: { state: { kind: "not-found" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Community not found" })).toBeInTheDocument();
  },
};

export const Invalid: Story = {
  args: { state: { kind: "invalid" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Invalid community address" })).toBeInTheDocument();
  },
};

export const Unavailable: Story = {
  args: { state: { kind: "unavailable" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Settings unavailable" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  },
};

/**
 * The management index under production access: moderation and names from the
 * routed reads, plus the bot sections once the deferred probe resolves.
 */
export const Index: Story = {
  name: "Index with bot access",
  args: { state: successState() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText("Telegram")).toBeInTheDocument());
    await expect(canvas.getByText("Names")).toBeInTheDocument();
    await expect(canvas.getByText("Moderation")).toBeInTheDocument();
  },
};

/** An unreachable bot probe hides the bot sections without touching the rest. */
export const IndexWithoutBotAccess: Story = {
  name: "Index with bot probe unavailable",
  args: { state: successState(), botProbeApi: unavailableProbe },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText("Names")).toBeInTheDocument());
    await expect(canvas.queryByText("Telegram")).toBeNull();
    await expect(canvas.queryByText("Assistant")).toBeNull();
  },
};

export const Mobile: Story = {
  args: { state: successState() },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
