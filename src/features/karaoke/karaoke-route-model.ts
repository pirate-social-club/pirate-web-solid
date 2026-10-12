import type {
  ApiKaraokeLeaderboard,
  ApiSongKaraokePayload,
  KaraokeApiClient,
} from "./karaoke-api";
import type { KaraokePlaybackGrant } from "./karaoke-playback-renewal";

export interface LoadedKaraokeLeaderboard {
  leaderboard: ApiKaraokeLeaderboard;
  payload: ApiSongKaraokePayload;
}

export function isKaraokeAuthError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("status" in error)) return false;
  // SAFETY: the `in` guard above establishes that the status field can be read from this error envelope.
  return (error as { status?: unknown }).status === 401;
}

export function loadKaraokePayload(client: KaraokeApiClient, postId: string, signal?: AbortSignal) {
  return client.getPayload(postId, signal);
}

/** A renewed URL may change; the recording and lyric/scoring revision may not. */
export async function renewKaraokePlayback(
  client: KaraokeApiClient,
  payload: ApiSongKaraokePayload,
  signal: AbortSignal,
): Promise<KaraokePlaybackGrant> {
  if (!payload.post || !payload.community || !payload.playback_access) throw new Error("Karaoke playback access is unavailable");
  const next = await client.getPayload(payload.post, signal, {
    communityId: payload.community,
    revisionId: payload.id,
    kind: payload.playback_access.kind,
    ref: payload.playback_access.ref,
  });
  signal.throwIfAborted();
  if (next.id !== payload.id || next.post !== payload.post || next.community !== payload.community
    || next.playback_access?.kind !== payload.playback_access.kind
    || next.playback_access?.ref !== payload.playback_access.ref) {
    throw new Error("The song changed. Reload Karaoke before starting another take.");
  }
  return next.playback_access.grant;
}

export async function loadKaraokeLeaderboard(
  client: KaraokeApiClient,
  postId: string,
  signal?: AbortSignal,
  onPayload?: (payload: ApiSongKaraokePayload) => void,
): Promise<LoadedKaraokeLeaderboard> {
  const payload = await client.getPayload(postId, signal);
  onPayload?.(payload);
  if (!payload.community) throw new Error("Karaoke leaderboard is not available for this song.");
  const leaderboard = await client.getLeaderboard({ communityId: payload.community, postId, signal });
  return { leaderboard, payload };
}
