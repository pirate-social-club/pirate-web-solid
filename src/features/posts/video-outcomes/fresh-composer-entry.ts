import type { VideoOutcome } from "./claim.ts";

export interface FreshVideoEntry {
  readonly song: { readonly communityId: string; readonly postId: string } | null;
}

/** Carries only song identity, never the failed submission, take or excerpt. */
export function freshVideoEntryHref(song: VideoOutcome["song"]): string {
  const search = new URLSearchParams({ compose: "video", fresh: "1" });
  if (song !== null) {
    search.set("song", song.post_id);
    search.set("song_community", song.community_id);
  }
  return `/communities?${search}`;
}

export function freshVideoEntryFromSearch(search: Record<string, string | string[] | undefined>): FreshVideoEntry | undefined {
  if (search.compose !== "video" || search.fresh !== "1") return undefined;
  if (search.song === undefined && search.song_community === undefined) return { song: null };
  if (typeof search.song !== "string" || typeof search.song_community !== "string"
    || search.song.trim() === "" || search.song_community.trim() === "") return undefined;
  return { song: { postId: search.song, communityId: search.song_community } };
}
