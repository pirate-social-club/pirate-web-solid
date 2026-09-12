import { describe, expect, it } from "vitest";

import { MAX_EXCERPT_MS, MIN_EXCERPT_MS } from "./song-excerpt";
import {
  makeSongExcerptDraft,
  parseStoredExcerptDraft,
  readSongExcerptDraft,
  restoreSongExcerpt,
  retainSongExcerpt,
  SONG_EXCERPT_DRAFT_VERSION,
  type SongExcerptDraft,
} from "./song-excerpt-draft";
import { FIXTURE_SONGS, findFixtureSong, fixtureSongsAreExcerptable } from "./song-excerpt-fixtures";

const SONG = FIXTURE_SONGS[0]!;

function memoryStore() {
  let stored: string | null = null;
  return {
    // Round-trips through JSON and parses on the way out, as a real store does.
    load: async () => (stored === null ? null : parseStoredExcerptDraft(JSON.parse(stored))),
    save: async (draft: SongExcerptDraft) => {
      stored = JSON.stringify(draft);
    },
  };
}

describe("retaining an excerpt with the video draft", () => {
  it("restores the exact integer milliseconds that were chosen", async () => {
    const store = memoryStore();
    const bounds = { startMs: 87_300, endMs: 104_900 };
    await retainSongExcerpt(store, SONG.id, bounds);
    const restored = await restoreSongExcerpt(store, SONG);
    // Not "close to": the same integers, because publication and MP3
    // extraction use these exact values.
    expect(restored).toEqual({ bounds, songPostId: SONG.id });
    expect(restored?.bounds.startMs).toBe(87_300);
    expect(restored?.bounds.endMs).toBe(104_900);
  });

  it("survives a JSON round trip without drifting", async () => {
    const store = memoryStore();
    for (const bounds of [
      { startMs: 0, endMs: MIN_EXCERPT_MS },
      { startMs: 1, endMs: 1 + MAX_EXCERPT_MS },
      { startMs: SONG.durationMs - MIN_EXCERPT_MS, endMs: SONG.durationMs },
    ]) {
      await retainSongExcerpt(store, SONG.id, bounds);
      expect((await restoreSongExcerpt(store, SONG))?.bounds).toEqual(bounds);
    }
  });

  it("refuses a draft that names a different song", async () => {
    const store = memoryStore();
    await retainSongExcerpt(store, SONG.id, { startMs: 10_000, endMs: 25_000 });
    expect(await restoreSongExcerpt(store, findFixtureSong("fixture-song-short-cut"))).toBeNull();
  });

  it("rejects an unversioned or malformed stored value at the parse boundary", () => {
    expect(parseStoredExcerptDraft(null)).toBeNull();
    expect(parseStoredExcerptDraft("not an object")).toBeNull();
    expect(parseStoredExcerptDraft({ songPostId: SONG.id, startMs: 0, endMs: 10_000 })).toBeNull();
    expect(
      parseStoredExcerptDraft({
        version: SONG_EXCERPT_DRAFT_VERSION,
        songPostId: SONG.id,
        startMs: "0",
        endMs: 10_000,
      }),
    ).toBeNull();
    // A well-formed draft still needs a song to be read against.
    expect(readSongExcerptDraft(makeSongExcerptDraft(SONG.id, { startMs: 0, endMs: 9_000 }), undefined))
      .toBeNull();
    expect(readSongExcerptDraft(null, SONG)).toBeNull();
  });

  it("clamps a stored value that no longer fits its song", () => {
    // A shorter song than the draft was written against: clamped into range
    // rather than restored as something the server would reject.
    const draft = makeSongExcerptDraft("fixture-song-interlude", { startMs: 0, endMs: 30_000 });
    const restored = readSongExcerptDraft(draft, findFixtureSong("fixture-song-interlude"));
    expect(restored?.bounds).toEqual({ startMs: 0, endMs: 8_200 });
  });

  it("keeps every fixture long enough to hold an excerpt", () => {
    expect(fixtureSongsAreExcerptable()).toBe(true);
  });
});
