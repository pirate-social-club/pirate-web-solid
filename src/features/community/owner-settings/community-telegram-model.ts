import type { GetCommunitiesCommunityIdTelegramResponse, GetCommunitiesCommunityIdTelegramDeliveriesResponse, GetCommunitiesCommunityIdTelegramChannelSetupSetupIdResponse } from "@pirate/api-client";

export type CommunityTelegramSettings = GetCommunitiesCommunityIdTelegramResponse;
export type CommunityAssistantSettings = CommunityTelegramSettings["assistant"];
export type CommunityTelegramDelivery = GetCommunitiesCommunityIdTelegramDeliveriesResponse["items"][number];
export type CommunityTelegramSetup = GetCommunitiesCommunityIdTelegramChannelSetupSetupIdResponse;
export type AssistantProvider = "openrouter" | "elevenlabs";
export type AssistantOption = Readonly<{ id: string; name: string }>;

export function assistantSettingsValid(settings: CommunityTelegramSettings): boolean {
  const policy = settings.assistant;
  return (!policy.enabled || (settings.openrouter.status === "valid" && policy.model.trim().length > 0))
    && (!policy.voice_enabled || (settings.elevenlabs.status === "valid" && policy.voice_id.trim().length > 0 && policy.voice_model.trim().length > 0))
    && [policy.user_daily_messages, policy.community_daily_messages, policy.daily_speech_characters].every((value) => Number.isSafeInteger(value) && value > 0 && value <= 100000)
    && policy.user_daily_messages <= policy.community_daily_messages;
}
