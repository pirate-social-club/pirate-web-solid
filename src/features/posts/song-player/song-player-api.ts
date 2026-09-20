import type { CreateSongPlaybackAccessResponse } from "@pirate/api-client";
import {
  createSessionApiClient,
  readCsrfCookie,
  sessionRequestOptions,
} from "../../../api/client.ts";
export type SongPlaybackGrant = CreateSongPlaybackAccessResponse;
export async function readSongPlaybackAccess(
  postId: string,
  signal?: AbortSignal,
): Promise<SongPlaybackGrant> {
  const csrf = readCsrfCookie();
  return createSessionApiClient().post_postsPostIdSongPlaybackAccess(
    { path: { postId } },
    csrf
      ? sessionRequestOptions(csrf, signal ? { signal } : {})
      : { credentials: "same-origin", ...(signal ? { signal } : {}) },
  );
}
