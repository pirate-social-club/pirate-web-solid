import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, waitFor, within } from "storybook/test";
import type { GetCommunitiesCommunityIdTelegramResponse } from "@pirate/api-client";

import type { OwnerSettingsRouteState } from "./owner-settings-route-model";
import type { OwnerSettingsAccess } from "./owner-settings-model";
import {
  ownerSettingsAccessFromModerationCapabilities,
} from "./community-moderation-settings-model";
import {
  MODERATION_POLICY,
  MODERATION_VIEW_AND_ACT,
  OPEN_MODERATION_CASE_DETAILS,
  OPEN_MODERATION_CASES,
} from "./community-moderation-settings-fixtures";
import { ownerSettingsAccessFromNamesSnapshot } from "./community-names-settings-model";
import { NAMES_ACTIVE } from "./community-names-settings-fixtures";
import {
  createCommunityModerationSettingsApi,
  type CommunityModerationSettingsApi,
} from "./community-moderation-settings-api";
import {
  createCommunityNamesSettingsApi,
  type CommunityNamesSettingsApi,
} from "./community-names-settings-api";
import {
  createCommunityTelegramSettingsApi,
  type CommunityTelegramSettingsApi,
} from "./community-telegram-settings-api";
import { createFakeNamespaceSettingsPort } from "./fake-owner-settings-port";
import { OwnerSettingsRouteView } from "./owner-settings-route-view";

/**
 * Production access is composed from the loader's real derivation functions —
 * the moderation read gates on moderation.view, a successful owner-only names
 * read grants names and namespace together — so the story inherits whatever
 * production derives instead of restating it. Section labels render in both
 * the desktop sidebar and the mobile nav, so label assertions use the
 * collision-safe plural queries.
 */
const productionAccess: OwnerSettingsAccess = {
  ...ownerSettingsAccessFromModerationCapabilities(MODERATION_VIEW_AND_ACT),
  ...ownerSettingsAccessFromNamesSnapshot(NAMES_ACTIVE),
};

function successState(
  overrides: Partial<Extract<OwnerSettingsRouteState, { kind: "success" }>> = {},
): OwnerSettingsRouteState {
  return {
    kind: "success",
    access: productionAccess,
    avatarUrl: null,
    communityId: "community-harbor",
    communityName: "Harbor",
    communityPath: "/c/harbor",
    ...overrides,
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

/**
 * Per-port snapshot stubs for the section controllers. Each one defaults to a
 * real API client, so a section story injects only the reads that section
 * performs; the rest of the surface keeps the production implementation and is
 * never called by the story. No casts: every override is checked against the
 * port's real response type.
 */
const namesSectionApi: CommunityNamesSettingsApi = {
  ...createCommunityNamesSettingsApi(),
  getSnapshot: async () => NAMES_ACTIVE,
};

const namespaceSectionApi = createFakeNamespaceSettingsPort();

const telegramSectionApi: CommunityTelegramSettingsApi = {
  ...createCommunityTelegramSettingsApi(),
  getDeliveries: async () => ({ items: [], next_cursor: null }),
  getSettings: async () => disconnectedTelegram,
};

const moderationSectionApi: CommunityModerationSettingsApi = {
  ...createCommunityModerationSettingsApi(),
  getCases: async () => ({ cases: OPEN_MODERATION_CASES, details: OPEN_MODERATION_CASE_DETAILS }),
  getPolicy: async () => MODERATION_POLICY,
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
 * The management index under production access: moderation from the moderation
 * read, names and Address together from the names read, plus the bot sections
 * once the deferred probe resolves.
 */
export const Index: Story = {
  name: "Index with bot access",
  args: { state: successState() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getAllByText("Telegram").length).toBeGreaterThan(0));
    expect(canvas.getAllByText("Names").length).toBeGreaterThan(0);
    expect(canvas.getAllByText("Address").length).toBeGreaterThan(0);
    expect(canvas.getAllByText("Moderation").length).toBeGreaterThan(0);
  },
};

export const Mobile: Story = {
  args: { state: successState() },
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

/** `/c/<segment>/settings/names` mounting the names controller through its typed port stub. */
export const SectionNames: Story = {
  name: "Section names",
  args: { requestedSection: "names", namesApi: namesSectionApi, state: successState() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Pause names" })).toBeInTheDocument());
  },
};

/** `/c/<segment>/settings/namespace` drives the real namespace controller through its fake port. */
export const SectionAddress: Story = {
  name: "Section address",
  args: { requestedSection: "namespace", namespaceApi: namespaceSectionApi, state: successState() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Continue" })).toBeInTheDocument());
  },
};

/** `/c/<segment>/settings/telegram` mounts the bot controller against the disconnected snapshot. */
export const SectionTelegram: Story = {
  name: "Section telegram",
  args: { requestedSection: "telegram", telegramApi: telegramSectionApi, state: successState() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Connect bot" })).toBeInTheDocument());
  },
};

/** `/c/<segment>/settings/moderation_queue` mounts the queue against the open-case fixtures. */
export const SectionModerationQueue: Story = {
  name: "Section moderation queue",
  args: {
    requestedSection: "moderation_queue",
    moderationApi: moderationSectionApi,
    state: successState({ moderationCapabilities: MODERATION_VIEW_AND_ACT }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getAllByText("Field recordings from the eastern breakwater").length).toBeGreaterThan(0),
    );
  },
};

/**
 * A section whose read failed stays listed and fails only once entered: the
 * shell shows the unavailable state with its retry instead of the panel.
 */
export const SectionReadUnavailable: Story = {
  name: "Section entered with unavailable read",
  args: {
    requestedSection: "moderation_queue",
    moderationApi: moderationSectionApi,
    state: successState({
      moderationCapabilities: MODERATION_VIEW_AND_ACT,
      unavailableSections: ["moderation_queue", "content_policy"],
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText("This settings check failed. Your access could not be determined. Try again.")).toBeInTheDocument(),
    );
    expect(canvas.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  },
};
