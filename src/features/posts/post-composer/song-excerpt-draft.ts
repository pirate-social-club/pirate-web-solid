import { clampExcerpt, type ExcerptBounds, isSubmittableExcerpt } from "./song-excerpt";

/** The excerpt selection as it is retained with a video draft.
 *
 * Reopening a draft must restore the same integer milliseconds that were
 * chosen, because these are the values publication and MP3 extraction use. A
 * draft that restored something merely close would produce a video danced to
 * one span and an MP3 cut from another.
 */
export const SONG_EXCERPT_DRAFT_VERSION = "song-excerpt-draft-v1";

export type SongExcerptDraft = {
  readonly endMs: number;
  readonly songId: string;
  readonly startMs: number;
  readonly version: typeof SONG_EXCERPT_DRAFT_VERSION;
};

/** A store yields a draft or nothing. Parsing belongs at the boundary that
 * reads the bytes, so nothing downstream of here handles an unparsed value. */
export type SongExcerptDraftStore = {
  readonly load: () => Promise<SongExcerptDraft | null>;
  readonly save: (draft: SongExcerptDraft) => Promise<void>;
};

export function makeSongExcerptDraft(songId: string, bounds: ExcerptBounds): SongExcerptDraft {
  return {
    endMs: bounds.endMs,
    songId,
    startMs: bounds.startMs,
    version: SONG_EXCERPT_DRAFT_VERSION,
  };
}

/** Narrows a stored value to a draft. A guard rather than an assertion, so
 * nothing is claimed about the value that has not been checked. */
export function isSongExcerptDraft(value: unknown): value is SongExcerptDraft {
  if (typeof value !== "object" || value === null) return false;
  if (!("version" in value && "songId" in value && "startMs" in value && "endMs" in value)) {
    return false;
  }
  return (
    value.version === SONG_EXCERPT_DRAFT_VERSION &&
    typeof value.songId === "string" &&
    typeof value.startMs === "number" &&
    typeof value.endMs === "number"
  );
}

/** The I/O boundary: whatever a store held becomes a draft or nothing. Stale,
 * hand-edited and older-version values are rejected here rather than repaired,
 * so nothing downstream has to wonder what it is holding. */
export function parseStoredExcerptDraft(value: unknown): SongExcerptDraft | null {
  return isSongExcerptDraft(value) ? value : null;
}

/** Reads a retained draft against the song it names. Range is the one thing
 * clamped rather than rejected, because a song can legitimately have changed
 * length under a draft; identity and shape are not repaired. */
export function readSongExcerptDraft(
  draft: SongExcerptDraft | null,
  song: { readonly durationMs: number; readonly id: string } | undefined,
): { bounds: ExcerptBounds; songId: string } | null {
  if (!song || !draft || draft.songId !== song.id) return null;
  const bounds = clampExcerpt({ startMs: draft.startMs, endMs: draft.endMs }, song.durationMs);
  return isSubmittableExcerpt(bounds, song.durationMs) ? { bounds, songId: song.id } : null;
}

/** Round-trips through a store. Kept as one pair so the save and the load
 * cannot drift apart. */
export async function retainSongExcerpt(
  store: SongExcerptDraftStore,
  songId: string,
  bounds: ExcerptBounds,
): Promise<void> {
  await store.save(makeSongExcerptDraft(songId, bounds));
}

export async function restoreSongExcerpt(
  store: SongExcerptDraftStore,
  song: { readonly durationMs: number; readonly id: string } | undefined,
): Promise<{ bounds: ExcerptBounds; songId: string } | null> {
  return readSongExcerptDraft(await store.load(), song);
}
