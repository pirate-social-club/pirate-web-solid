/**
 * api-next karaoke contract boundary.
 *
 * pirate-web-solid intentionally has no workspace dependency on api-next. These
 * types mirror the generated contract's wire shape at the application boundary;
 * the adapter below is the only place where snake_case API fields become the
 * runtime's camelCase session descriptor.
 */

export interface ApiKaraokeScoringPolicyDisabled {
  kind: "disabled";
}

export interface ApiKaraokeScoringPolicyEnabled {
  kind: "enabled";
  provider: "assistant" | "elevenlabs" | "mistral" | "openai";
  model: string;
  retention: "not_stored";
  voice_coach_enabled?: boolean;
}

export type ApiKaraokeScoringPolicy =
  | ApiKaraokeScoringPolicyDisabled
  | ApiKaraokeScoringPolicyEnabled;

export interface ApiKaraokeSession {
  id: string;
  object: "karaoke_session";
  attempt: string;
  protocol_version: 1;
  websocket_url: string;
  token_expires_at: number;
  session_expires_at: number;
  scoring_policy: ApiKaraokeScoringPolicy;
}

export interface ApiKaraokeAttempt {
  id: string;
  object: "karaoke_attempt";
  session_id: string;
  attempt_id: string;
  post_id: string;
  community_id: string;
  karaoke_revision_id: string;
  scoring_version: number;
  scoring_provider: string;
  scoring_model: string;
  final_score: number;
  lyrics_score: number;
  timing_score: number | null;
  timing_trend: "early" | "late" | "mixed" | "on_time";
  scored_line_count: number;
  line_count: number;
  uncertain_line_count: number;
  no_recognition_line_count: number;
  low_confidence_line_count: number;
  completion_reason: "completed" | "session_error" | "provider_unavailable" | "abandoned";
  rank_eligible: boolean;
  activity_date: string;
  completed_at: string;
  created_at: string;
}

/** Converts the api-next session response to the framework-neutral runtime shape. */
export function toKaraokeSessionDescriptor(session: ApiKaraokeSession) {
  return {
    attempt: session.attempt,
    id: session.id,
    protocolVersion: session.protocol_version,
    sessionExpiresAt: session.session_expires_at,
    tokenExpiresAt: session.token_expires_at,
    websocketUrl: session.websocket_url,
  } as const;
}
