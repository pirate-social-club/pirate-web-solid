import type {
  ApiKaraokeLeaderboard,
  ApiSongKaraokePayload,
  KaraokeApiClient,
} from "./karaoke-api";

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

export async function loadKaraokeLeaderboard(
  client: KaraokeApiClient,
  postId: string,
  signal?: AbortSignal,
): Promise<LoadedKaraokeLeaderboard> {
  const payload = await client.getPayload(postId, signal);
  if (!payload.community) throw new Error("Karaoke leaderboard is not available for this song.");
  const leaderboard = await client.getLeaderboard({ communityId: payload.community, postId, signal });
  return { leaderboard, payload };
}
