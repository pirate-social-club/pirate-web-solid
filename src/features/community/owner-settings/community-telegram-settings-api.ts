import { createPirateApiClient, type PirateApiClient } from "@pirate/api-client";
import { createGeneratedApiClient, readCsrfCookie, sessionRequestOptions } from "../../../api/client";
import type { ApiFetch } from "../../../api/proxy";
import type { AssistantProvider, CommunityTelegramSettings } from "./community-telegram-model";

export function createCommunityTelegramSettingsApi(options: { client?: PirateApiClient; fetchImpl?: ApiFetch; origin?: string | URL; readCsrfToken?: () => string | undefined } = {}) {
  let generated = options.client;
  const client = () => generated ??= createGeneratedApiClient(createPirateApiClient, { fetchImpl: options.fetchImpl, origin: options.origin }, { credentials: "same-origin" });
  const writeOptions = () => {
    const csrf = (options.readCsrfToken ?? readCsrfCookie)();
    if (csrf === undefined) throw new Error("Refresh the page before changing Telegram settings.");
    return sessionRequestOptions(csrf);
  };
  const fence = (settings: CommunityTelegramSettings, key: string) => ({ expected_revision: settings.revision, idempotency_key: key });
  return {
    getSettings: ({ communityId, signal }: { communityId: string; signal?: AbortSignal }) => client().get_communitiesCommunityIdTelegram({ path: { communityId } }, { signal }),
    getDeliveries: (communityId: string) => client().get_communitiesCommunityIdTelegramDeliveries({ path: { communityId } }),
    getModels: (communityId: string) => client().get_communitiesCommunityIdTelegramModels({ path: { communityId } }),
    getVoices: (communityId: string) => client().get_communitiesCommunityIdTelegramVoices({ path: { communityId } }),
    connect: (settings: CommunityTelegramSettings, token: string, key: string) => client().post_communitiesCommunityIdTelegramConnect({ path: { communityId: settings.community_id }, body: { ...fence(settings, key), token } }, writeOptions()),
    disconnect: (settings: CommunityTelegramSettings, key: string) => client().post_communitiesCommunityIdTelegramDisconnect({ path: { communityId: settings.community_id }, body: fence(settings, key) }, writeOptions()),
    save: (settings: CommunityTelegramSettings, key: string) => client().post_communitiesCommunityIdTelegramSettings({ path: { communityId: settings.community_id }, body: { ...fence(settings, key), automatic_publishing: settings.automatic_publishing, assistant: settings.assistant } }, writeOptions()),
    saveCredential: (settings: CommunityTelegramSettings, provider: AssistantProvider, credential: string, key: string) => client().post_communitiesCommunityIdTelegramCredentials({ path: { communityId: settings.community_id }, body: { ...fence(settings, key), provider, key: credential } }, writeOptions()),
    startSetup: (settings: CommunityTelegramSettings, key: string) => client().post_communitiesCommunityIdTelegramChannelSetup({ path: { communityId: settings.community_id }, body: fence(settings, key) }, writeOptions()),
    getSetup: (communityId: string, setupId: string) => client().get_communitiesCommunityIdTelegramChannelSetupSetupId({ path: { communityId, setupId } }),
    confirmSetup: (settings: CommunityTelegramSettings, setupId: string, key: string) => client().post_communitiesCommunityIdTelegramChannelSetupSetupIdConfirm({ path: { communityId: settings.community_id, setupId }, body: fence(settings, key) }, writeOptions()),
    backfill: (settings: CommunityTelegramSettings, key: string, postIds: ReadonlyArray<string> = []) => client().post_communitiesCommunityIdTelegramPublications({ path: { communityId: settings.community_id }, body: { ...fence(settings, key), post_ids: postIds } }, writeOptions()),
    resolve: (settings: CommunityTelegramSettings, deliveryId: string, resolution: "confirmed" | "not_sent" | "cancel", key: string, messageId?: number) => client().post_communitiesCommunityIdTelegramDeliveriesDeliveryIdResolve({ path: { communityId: settings.community_id, deliveryId }, body: { ...fence(settings, key), resolution, ...(messageId === undefined ? {} : { message_id: messageId }) } }, writeOptions()),
  };
}
export type CommunityTelegramSettingsApi = ReturnType<typeof createCommunityTelegramSettingsApi>;
