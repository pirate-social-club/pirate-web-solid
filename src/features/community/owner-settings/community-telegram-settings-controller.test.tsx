import { render as solidRender, type JSX } from "@solidjs/web";
import { createRoot, createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { CommunityTelegramSettingsController } from "./community-telegram-settings-controller";
import type { CommunityTelegramSettingsApi } from "./community-telegram-settings-api";
import { TELEGRAM_DISCONNECTED } from "./community-telegram-fixtures";
import type { CommunityTelegramSettings } from "./community-telegram-model";

const disposers: Array<() => void> = [];
function render(ui: () => JSX.Element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose = () => {};
  createRoot((cleanup) => {
    dispose = cleanup;
    disposers.push(cleanup);
    solidRender(ui, container);
  });
  return { container, dispose };
}
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});
function api(overrides: Partial<CommunityTelegramSettingsApi> = {}): CommunityTelegramSettingsApi {
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected write"); };
  return {
    getSettings: async ({ communityId }) => ({ ...TELEGRAM_DISCONNECTED, community_id: communityId }),
    getDeliveries: async () => ({ items: [], next_cursor: null }),
    getModels: async () => ({ items: [] }), getVoices: async () => ({ items: [] }),
    connect: unexpected, disconnect: unexpected, save: unexpected, saveCredential: unexpected,
    startSetup: unexpected, getSetup: unexpected, confirmSetup: unexpected, backfill: unexpected, resolve: unexpected,
    ...overrides,
  };
}

test.each(["telegram", "assistant"] as const)("mounts the %s settings controller under Solid 2", async (section) => {
  const getSettings = vi.fn<CommunityTelegramSettingsApi["getSettings"]>(async ({ communityId }) => ({
    ...TELEGRAM_DISCONNECTED, community_id: communityId,
  }));
  const { container } = render(() => <CommunityTelegramSettingsController communityId="community-fixture" section={section} api={api({ getSettings })} />);
  await vi.waitFor(() => expect(container.querySelector(section === "telegram" ? "#telegram-bot-token" : "#assistant-model")).not.toBeNull());
  expect(getSettings).toHaveBeenCalledTimes(1);
});

test("does not install an old community's settings after switching communities", async () => {
  let resolveOld!: (settings: CommunityTelegramSettings) => void;
  const getSettings = vi.fn<CommunityTelegramSettingsApi["getSettings"]>(({ communityId }) => communityId === "old-community"
    ? new Promise((resolve) => { resolveOld = resolve; })
    : Promise.resolve({ ...TELEGRAM_DISCONNECTED, community_id: communityId, bot_username: "current_bot" }));
  const [communityId, setCommunityId] = createSignal("old-community");
  const { container } = render(() => <CommunityTelegramSettingsController communityId={communityId()} section="telegram" api={api({ getSettings })} />);
  await vi.waitFor(() => expect(getSettings).toHaveBeenCalledTimes(1));
  setCommunityId("current-community");
  await vi.waitFor(() => expect(container.textContent).toContain("@current_bot"));
  resolveOld({ ...TELEGRAM_DISCONNECTED, community_id: "old-community", bot_username: "obsolete_bot" });
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  expect(container.textContent).toContain("@current_bot");
  expect(container.textContent).not.toContain("@obsolete_bot");
});

test("does not load settings after disposal before the queued reset", async () => {
  const getSettings = vi.fn<CommunityTelegramSettingsApi["getSettings"]>(async () => TELEGRAM_DISCONNECTED);
  const { dispose } = render(() => <CommunityTelegramSettingsController communityId="community-fixture" section="telegram" api={api({ getSettings })} />);
  dispose();
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  expect(getSettings).not.toHaveBeenCalled();
});

test("skips a queued reset for a community that is no longer selected", async () => {
  const getSettings = vi.fn<CommunityTelegramSettingsApi["getSettings"]>(async ({ communityId }) => ({
    ...TELEGRAM_DISCONNECTED, community_id: communityId, bot_username: "current_bot",
  }));
  const [communityId, setCommunityId] = createSignal("obsolete-community");
  const { container } = render(() => <CommunityTelegramSettingsController communityId={communityId()} section="telegram" api={api({ getSettings })} />);
  setCommunityId("current-community");
  await vi.waitFor(() => expect(container.textContent).toContain("@current_bot"));
  expect(getSettings).toHaveBeenCalledTimes(1);
  expect(getSettings).toHaveBeenCalledWith({ communityId: "current-community" });
});
