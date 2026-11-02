import type { CommunityTelegramSettings } from "./community-telegram-model";

export const TELEGRAM_DISCONNECTED: CommunityTelegramSettings = {
  community_id: "community-fixture", revision: 0, status: "disconnected", bot_username: null, channel: null, automatic_publishing: false,
  assistant: { enabled: false, model: "", instructions: "Help people discover public community songs and activities. Include relevant Pirate links.", voice_enabled: false, voice_id: "", voice_model: "eleven_multilingual_v2", voice_reply_mode: "match_input", user_daily_messages: 20, community_daily_messages: 200, daily_speech_characters: 10000, remember_conversations: true },
  openrouter: { status: "missing", checked_at: null }, elevenlabs: { status: "missing", checked_at: null }, last_error: null,
};
export const TELEGRAM_CONNECTED: CommunityTelegramSettings = {
  ...TELEGRAM_DISCONNECTED, revision: 4, status: "ready", bot_username: "community_fixture_bot", channel: { title: "Community songs", username: "community_fixture_channel" }, automatic_publishing: true,
  assistant: { ...TELEGRAM_DISCONNECTED.assistant, enabled: true, model: "provider/community-model", voice_enabled: true, voice_id: "community-voice" },
  openrouter: { status: "valid", checked_at: "2026-09-08T10:00:00.000Z" }, elevenlabs: { status: "valid", checked_at: "2026-09-08T10:00:00.000Z" },
};
