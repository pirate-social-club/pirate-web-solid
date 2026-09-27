import type { SongLibrarySource } from "./your-songs-model.ts";

/**
 * The persona song-library and trending reads belong to the api-next task
 * `api-persona-song-library`, which has not been released; the vendored client
 * carries neither operation. Until a client with them is vendored, Your songs
 * renders its not-yet-available state instead of calling an absent endpoint
 * or showing fixture songs as live data.
 */
export const songLibrarySource: SongLibrarySource | undefined = undefined;
