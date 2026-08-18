import type { ApiKaraokeAttempt, ApiKaraokeSession } from "./runtime/api-contracts";
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

export interface KaraokeApiClientOptions {
  apiOrigin?: string;
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

const DEFAULT_API_ORIGIN = "https://api-next-staging.pirate.sc";

function joinUrl(origin: string, path: string): string {
  return `${origin.replace(/\/$/u, "")}${path}`;
}

async function readJson<T>(response: Response): Promise<T> {
  if (response.ok) {
    // SAFETY: every caller supplies the api-next response type for this endpoint; the HTTP adapter is the single wire boundary.
    return await response.json() as T;
  }

  let body: { code?: unknown; message?: unknown; retryable?: unknown } | null = null;
  try {
    // SAFETY: the error envelope is narrowed by the field checks immediately below; malformed bodies use the status fallback.
    body = await response.json() as { code?: unknown; message?: unknown; retryable?: unknown };
  } catch {
    // Preserve the HTTP status when the API did not return JSON.
  }
  const code = typeof body?.code === "string" ? body.code : response.status === 401 ? "auth_error" : "karaoke_api_error";
  const message = typeof body?.message === "string" ? body.message : `Karaoke request failed (${response.status})`;
  throw new KaraokeApiError(code, message, response.status, typeof body?.retryable === "boolean" ? body.retryable : undefined);
}

export function createKaraokeApiClient(options: KaraokeApiClientOptions = {}): KaraokeApiClient {
  const apiOrigin = options.apiOrigin
    ?? (typeof import.meta.env?.VITE_API_ORIGIN === "string" ? import.meta.env.VITE_API_ORIGIN : DEFAULT_API_ORIGIN);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const request = async <T>(path: string, init?: RequestInit): Promise<T> =>
    readJson<T>(await fetchImpl(joinUrl(apiOrigin, path), { credentials: "include", ...init }));

  return {
    createSession: ({ communityId, idempotencyKey, postId, signal }) => request<ApiKaraokeSession>(
      `/communities/${encodeURIComponent(communityId)}/posts/${encodeURIComponent(postId)}/karaoke/sessions`,
      {
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        method: "POST",
        signal,
      },
    ),
    getLeaderboard: ({ communityId, limit, postId, signal }) => {
      const query = limit === undefined ? "" : `?limit=${encodeURIComponent(String(limit))}`;
      return request<ApiKaraokeLeaderboard>(
        `/communities/${encodeURIComponent(communityId)}/posts/${encodeURIComponent(postId)}/karaoke/leaderboard${query}`,
        { method: "GET", signal },
      );
    },
    getAttempt: ({ attemptId, communityId, signal }) => request<ApiKaraokeAttempt>(
      `/communities/${encodeURIComponent(communityId)}/karaoke/attempts/${encodeURIComponent(attemptId)}`,
      { method: "GET", signal },
    ),
    getPayload: (postId, signal) => request<ApiSongKaraokePayload>(
      `/public-posts/${encodeURIComponent(postId)}/karaoke`,
      { method: "GET", signal },
    ),
  };
}
