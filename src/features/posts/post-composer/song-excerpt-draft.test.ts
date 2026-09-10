import { describe, expect, it } from "vitest";

import { MAX_EXCERPT_MS, MIN_EXCERPT_MS } from "./song-excerpt";
import { BAR_MS, excerptToneSchedule, frequencyAt } from "./song-excerpt-audio";
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
import {
  advancePreview,
  previewProgress,
  reboundPreview,
  startPreview,
  stopPreview,
} from "./song-excerpt-preview";

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

describe("excerpt preview bounds", () => {
  const bounds = { startMs: 40_000, endMs: 52_000 };

  it("begins at the start of the excerpt, not the start of the song", () => {
    expect(startPreview(bounds)).toEqual({ playing: true, positionMs: 40_000 });
    expect(stopPreview(bounds)).toEqual({ playing: false, positionMs: 40_000 });
  });

  it("stops exactly at the end and never runs past it", () => {
    let state = startPreview(bounds);
    for (let tick = 0; tick < 200 && state.playing; tick++) state = advancePreview(state, bounds, 250);
    expect(state).toEqual({ playing: false, positionMs: 52_000 });
    // A late frame cannot overshoot into audio outside the selection.
    expect(advancePreview(startPreview(bounds), bounds, 999_999)).toEqual({
      playing: false,
      positionMs: 52_000,
    });
  });

  it("follows the selection when the bounds change mid-preview", () => {
    const playing = advancePreview(startPreview(bounds), bounds, 3_000);
    const moved = { startMs: 120_000, endMs: 132_000 };
    expect(reboundPreview(playing, moved)).toEqual({ playing: true, positionMs: 120_000 });
    // A position still inside the new selection is left alone.
    expect(reboundPreview(playing, { startMs: 40_000, endMs: 60_000 })).toEqual(playing);
  });

  it("reports progress across the excerpt rather than the song", () => {
    expect(previewProgress(startPreview(bounds), bounds)).toBe(0);
    expect(previewProgress({ playing: true, positionMs: 46_000 }, bounds)).toBeCloseTo(0.5, 5);
    expect(previewProgress({ playing: false, positionMs: 52_000 }, bounds)).toBe(1);
  });
});

describe("audible excerpt preview", () => {
  it("sounds the bar the excerpt starts in, not the start of the song", () => {
    // Position-dependent by design: an excerpt starting at 41s is inside a
    // different bar than one starting at 0s, and must sound different.
    expect(frequencyAt(0)).not.toBe(frequencyAt(41_000));
    expect(excerptToneSchedule({ startMs: 41_000, endMs: 53_000 })[0]).toEqual({
      frequencyHz: frequencyAt(41_000),
      offsetMs: 0,
    });
  });

  it("changes on bar boundaries and schedules nothing at or past the end", () => {
    const bounds = { startMs: 41_000, endMs: 53_000 };
    const steps = excerptToneSchedule(bounds);
    expect(steps[0]?.offsetMs).toBe(0);
    for (const step of steps) {
      expect(step.offsetMs).toBeGreaterThanOrEqual(0);
      // Nothing is scheduled at or beyond the end of the excerpt, so no tone
      // belongs to audio the author did not select.
      expect(step.offsetMs).toBeLessThan(bounds.endMs - bounds.startMs);
      expect((bounds.startMs + step.offsetMs) % BAR_MS === 0 || step.offsetMs === 0).toBe(true);
    }
    // 41s starts partway through a bar, so the first step is that partial bar
    // and six more land on the boundaries at 42, 44, 46, 48, 50 and 52 seconds.
    expect(steps).toHaveLength(7);
    expect(steps.map((step) => step.offsetMs)).toEqual([0, 1_000, 3_000, 5_000, 7_000, 9_000, 11_000]);
  });

  it("moving the excerpt changes what is heard", () => {
    const early = excerptToneSchedule({ startMs: 0, endMs: 12_000 });
    const late = excerptToneSchedule({ startMs: 60_000, endMs: 72_000 });
    expect(early.map((step) => step.frequencyHz)).not.toEqual(late.map((step) => step.frequencyHz));
  });

  it("a six second excerpt still sounds, and a thirty second one is bounded", () => {
    expect(excerptToneSchedule({ startMs: 0, endMs: MIN_EXCERPT_MS }).length).toBeGreaterThan(0);
    for (const step of excerptToneSchedule({ startMs: 0, endMs: MAX_EXCERPT_MS })) {
      expect(step.offsetMs).toBeLessThan(MAX_EXCERPT_MS);
    }
  });
});
