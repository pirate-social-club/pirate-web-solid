import {
  ApiClientError,
  createPirateApiClient,
  type GetCommunitiesCommunityIdKaraokeAttemptsAttemptIdResponse,
  type GetCommunitiesCommunityIdPostsPostIdKaraokeLeaderboardResponse,
  type GetCommunitiesCommunityIdPostsPostIdKaraokeResponse,
  type PirateApiClient,
  type PostCommunitiesCommunityIdPostsPostIdKaraokeAttemptsResponse,
} from "@pirate/api-client-happy-path";
import {
  createGeneratedApiClient,
  readCsrfCookie,
  sessionRequestOptions,
} from "../../api/client";
import type { ApiFetch } from "../../api/proxy";
import type {
  ApiKaraokeAttempt,
  ApiKaraokeScoringDiagnostics,
  ApiKaraokeSession,
} from "./runtime/api-contracts";
import { KaraokeApiError } from "./karaoke-session-bridge";

export interface ApiSongKaraokeLine {
  id: string;
  index: number;
  kind: "lyric" | "section";
  text: string;
  start_ms: number;
  end_ms: number;
  words: Array<{ text: string; start_ms: number; end_ms: number; confidence?: number | null }>;
}

export interface ApiSongKaraokePayload {
  id: string;
  object: "song_karaoke_payload";
  song?: string | null;
  post?: string | null;
  community?: string | null;
  title?: string | null;
  artist_name?: string | null;
  artwork_src?: string | null;
  instrumental_audio_url?: string | null;
  karaoke_lines?: ApiSongKaraokeLine[] | null;
  raw_lines?: unknown[] | null;
}

export interface ApiKaraokeLeaderboard {
  object: "karaoke_song_leaderboard";
  post_id: string;
  community_id: string;
  scope: "all_time" | "weekly";
  period_start?: string | null;
  period_end?: string | null;
  karaoke_revision_id: string;
  scoring_version: number;
  scoring_provider: string;
  scoring_model: string;
  total_ranked: number;
  entries: Array<{
    rank: number;
    top_percent: number;
    score: number;
    reached_at: string;
    identity: {
      visibility: "visible" | "anonymized";
      display_name: string | null;
      handle: string | null;
      avatar_ref: string | null;
    };
    is_viewer: boolean;
  }>;
  viewer_rank: number | null;
  viewer_top_percent: number | null;
  viewer_best_score: number | null;
  viewer_best_reached_at: string | null;
  viewer_eligible_attempt_count: number;
}

export interface KaraokeApiClient {
  getPayload(postId: string, signal?: AbortSignal): Promise<ApiSongKaraokePayload>;
  createSession(input: {
    communityId: string;
    postId: string;
    idempotencyKey: string;
    signal?: AbortSignal;
  }): Promise<ApiKaraokeSession>;
  getAttempt(input: { communityId: string; attemptId: string; signal?: AbortSignal }): Promise<ApiKaraokeAttempt>;
  getLeaderboard(input: {
    communityId: string;
    postId: string;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<ApiKaraokeLeaderboard>;
}

type KaraokeGeneratedClient = Pick<
  PirateApiClient,
  | "get_communitiesCommunityIdKaraokeAttemptsAttemptId"
  | "get_communitiesCommunityIdPostsPostIdKaraoke"
  | "get_communitiesCommunityIdPostsPostIdKaraokeLeaderboard"
  | "get_postsPostId"
  | "post_communitiesCommunityIdPostsPostIdKaraokeAttempts"
>;

export interface KaraokeApiClientOptions {
  /** Test seam. Production uses the generated client through the same-origin Worker proxy. */
  client?: KaraokeGeneratedClient;
  origin?: string | URL;
  fetchImpl?: ApiFetch;
  readCsrfToken?: () => string | undefined;
}

export class KaraokeAvailabilityError extends KaraokeApiError {
  readonly state: "processing" | "unavailable";

  constructor(state: "processing" | "unavailable", reason: string) {
    const processing = state === "processing";
    super(
      reason,
      processing
        ? "This song is still being prepared for karaoke."
        : "Karaoke is not available for this song.",
      processing ? 202 : 409,
      processing,
    );
    this.name = "KaraokeAvailabilityError";
    this.state = state;
  }
}

function finiteNumber(value: number | "Infinity" | "-Infinity" | "NaN", field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new KaraokeApiError(
      "invalid_karaoke_response",
      `Karaoke response contains an invalid ${field}.`,
      502,
      false,
    );
  }
  return value;
}

function optionalFiniteNumber(
  value: number | "Infinity" | "-Infinity" | "NaN" | null,
  field: string,
): number | null {
  return value === null ? null : finiteNumber(value, field);
}

async function callApi<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (error instanceof KaraokeApiError) throw error;
    if (error instanceof ApiClientError) {
      throw new KaraokeApiError(error.code, error.message, error.status, error.retryable);
    }
    throw error;
  }
}

function mapPayload(
  response: Extract<GetCommunitiesCommunityIdPostsPostIdKaraokeResponse, { state: "ready" }>,
): ApiSongKaraokePayload {
  return {
    community: response.community_id,
    id: response.karaoke_revision_id,
    instrumental_audio_url: response.playback_audio.ref,
    karaoke_lines: response.karaoke_lines.map((line) => ({
      end_ms: finiteNumber(line.end_ms, "karaoke line end"),
      id: line.id,
      index: finiteNumber(line.index, "karaoke line index"),
      kind: line.kind,
      start_ms: finiteNumber(line.start_ms, "karaoke line start"),
      text: line.text,
      words: line.words.map((word) => ({
        end_ms: finiteNumber(word.end_ms, "karaoke word end"),
        start_ms: finiteNumber(word.start_ms, "karaoke word start"),
        text: word.text,
      })),
    })),
    object: response.object,
    post: response.post_id,
    title: response.title,
  };
}

function mapSession(
  response: PostCommunitiesCommunityIdPostsPostIdKaraokeAttemptsResponse,
): ApiKaraokeSession {
  const policy = response.scoring_policy;
  return {
    attempt: response.attempt,
    id: response.id,
    object: response.object,
    protocol_version: response.protocol_version,
    scoring_policy: policy.kind === "disabled"
      ? { kind: "disabled" }
      : {
          kind: "enabled",
          model: policy.model,
          provider: policy.provider,
          retention: policy.provider_retention,
          voice_coach_enabled: policy.voice_coach_enabled ?? undefined,
        },
    session_expires_at: finiteNumber(response.session_expires_at, "session expiration"),
    token_expires_at: finiteNumber(response.token_expires_at, "token expiration"),
    websocket_url: response.websocket_url,
  };
}

function mapScoringDiagnostics(
  diagnostics: NonNullable<GetCommunitiesCommunityIdKaraokeAttemptsAttemptIdResponse["scoring_diagnostics"]>,
): ApiKaraokeScoringDiagnostics {
  return {
    line_diagnostics: diagnostics.line_diagnostics.map((line) => ({
      confidence_score: optionalFiniteNumber(line.confidence_score, "line confidence score"),
      finalized_reason: line.finalized_reason,
      line_id: line.line_id,
      median_signed_delta_ms: optionalFiniteNumber(line.median_signed_delta_ms, "line timing delta"),
      recognized_word_count: finiteNumber(line.recognized_word_count, "recognized word count"),
      score: finiteNumber(line.score, "line score"),
      text_score: finiteNumber(line.text_score, "line text score"),
      timing_score: optionalFiniteNumber(line.timing_score, "line timing score"),
    })),
    timing_calibration: {
      matched_word_count: finiteNumber(diagnostics.timing_calibration.matched_word_count, "matched word count"),
      measured_line_count: finiteNumber(diagnostics.timing_calibration.measured_line_count, "measured line count"),
      offset_ms: finiteNumber(diagnostics.timing_calibration.offset_ms, "timing offset"),
      raw_offset_ms: finiteNumber(diagnostics.timing_calibration.raw_offset_ms, "raw timing offset"),
      reason: diagnostics.timing_calibration.reason,
      residual_spread_ms: finiteNumber(diagnostics.timing_calibration.residual_spread_ms, "timing residual spread"),
      state: diagnostics.timing_calibration.state,
    },
  };
}

function mapAttempt(response: GetCommunitiesCommunityIdKaraokeAttemptsAttemptIdResponse): ApiKaraokeAttempt {
  return {
    activity_date: response.activity_date,
    attempt_id: response.attempt_id,
    community_id: response.community_id,
    completed_at: response.completed_at,
    completion_reason: response.completion_reason,
    created_at: response.created_at,
    final_score: finiteNumber(response.final_score, "final score"),
    id: response.id,
    karaoke_revision_id: response.karaoke_revision_id,
    line_count: finiteNumber(response.line_count, "line count"),
    low_confidence_line_count: finiteNumber(response.low_confidence_line_count, "low-confidence line count"),
    lyrics_score: finiteNumber(response.lyrics_score, "lyrics score"),
    no_recognition_line_count: finiteNumber(response.no_recognition_line_count, "unrecognized line count"),
    object: response.object,
    post_id: response.post_id,
    rank_eligible: response.rank_eligible,
    scored_line_count: finiteNumber(response.scored_line_count, "scored line count"),
    scoring_diagnostics: response.scoring_diagnostics
      ? mapScoringDiagnostics(response.scoring_diagnostics)
      : response.scoring_diagnostics,
    scoring_model: response.scoring_model,
    scoring_provider: response.scoring_provider,
    scoring_version: finiteNumber(response.scoring_version, "scoring version"),
    session_id: response.session_id,
    timing_score: optionalFiniteNumber(response.timing_score, "timing score"),
    timing_trend: response.timing_trend,
    uncertain_line_count: finiteNumber(response.uncertain_line_count, "uncertain line count"),
  };
}

function mapLeaderboard(
  response: GetCommunitiesCommunityIdPostsPostIdKaraokeLeaderboardResponse,
): ApiKaraokeLeaderboard {
  return {
    community_id: response.community_id,
    entries: response.entries.map((entry) => ({
      identity: { ...entry.identity },
      is_viewer: entry.is_viewer,
      rank: finiteNumber(entry.rank, "leaderboard rank"),
      reached_at: entry.reached_at,
      score: finiteNumber(entry.score, "leaderboard score"),
      top_percent: finiteNumber(entry.top_percent, "leaderboard percentile"),
    })),
    karaoke_revision_id: response.karaoke_revision_id,
    object: response.object,
    period_end: response.period_end,
    period_start: response.period_start,
    post_id: response.post_id,
    scope: response.scope,
    scoring_model: response.scoring_model,
    scoring_provider: response.scoring_provider,
    scoring_version: finiteNumber(response.scoring_version, "leaderboard scoring version"),
    total_ranked: finiteNumber(response.total_ranked, "ranked singer count"),
    viewer_best_reached_at: response.viewer_best_reached_at,
    viewer_best_score: optionalFiniteNumber(response.viewer_best_score, "viewer best score"),
    viewer_eligible_attempt_count: finiteNumber(response.viewer_eligible_attempt_count, "viewer attempt count"),
    viewer_rank: optionalFiniteNumber(response.viewer_rank, "viewer rank"),
    viewer_top_percent: optionalFiniteNumber(response.viewer_top_percent, "viewer percentile"),
  };
}

export function createKaraokeApiClient(options: KaraokeApiClientOptions = {}): KaraokeApiClient {
  let generatedClient = options.client;
  const client = (): KaraokeGeneratedClient => {
    generatedClient ??= createGeneratedApiClient(
      createPirateApiClient,
      {
        fetchImpl: options.fetchImpl,
        origin: options.origin,
      },
      { credentials: "same-origin" },
    );
    return generatedClient;
  };
  const csrfToken = options.readCsrfToken ?? readCsrfCookie;

  return {
    createSession: async ({ communityId, idempotencyKey, postId, signal }) => {
      const token = csrfToken();
      if (token === undefined) {
        throw new KaraokeApiError(
          "csrf_required",
          "Refresh the page before starting a karaoke take.",
          403,
          false,
        );
      }
      const response = await callApi(() => client().post_communitiesCommunityIdPostsPostIdKaraokeAttempts(
        {
          body: {},
          headers: { "idempotency-key": idempotencyKey },
          path: { communityId, postId },
        },
        sessionRequestOptions(token, { signal }),
      ));
      return mapSession(response);
    },
    getAttempt: async ({ attemptId, communityId, signal }) => mapAttempt(await callApi(() =>
      client().get_communitiesCommunityIdKaraokeAttemptsAttemptId(
        { path: { attemptId, communityId } },
        { signal },
      ))),
    getLeaderboard: async ({ communityId, limit, postId, signal }) => mapLeaderboard(await callApi(() =>
      client().get_communitiesCommunityIdPostsPostIdKaraokeLeaderboard(
        {
          path: { communityId, postId },
          query: limit === undefined ? undefined : { limit: String(limit) },
        },
        { signal },
      ))),
    getPayload: async (postId, signal) => {
      const post = await callApi(() => client().get_postsPostId({ path: { postId } }, { signal }));
      if ("kind" in post) {
        throw new KaraokeApiError("age_locked", "Age verification is required for this song.", 403, false);
      }
      const response = await callApi(() => client().get_communitiesCommunityIdPostsPostIdKaraoke(
        { path: { communityId: post.post.community, postId } },
        { signal },
      ));
      if (response.state !== "ready") {
        throw new KaraokeAvailabilityError(response.state, response.reason);
      }
      return mapPayload(response);
    },
  };
}
