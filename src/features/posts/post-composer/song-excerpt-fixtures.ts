import { canHoldExcerpt } from "./song-excerpt";

/** Fixture songs for exercising excerpt selection locally.
 *
 * These are not songs. There is no audio, no canonical revision, no owner
 * policy and no licence behind them, and nothing here reaches a server. They
 * exist so the selection flow can be exercised on a phone-sized preview before
 * any of that is wired, and every surface that renders them must say so.
 */
export type FixtureSong = {
  readonly artistLabel: string;
  readonly durationMs: number;
  readonly id: string;
  readonly title: string;
};

export const FIXTURE_SONGS: readonly FixtureSong[] = Object.freeze([
  Object.freeze({
    artistLabel: "Fixture artist",
    durationMs: 214_000,
    id: "fixture-song-cadence",
    title: "Cadence (fixture)",
  }),
  Object.freeze({
    artistLabel: "Fixture artist",
    durationMs: 96_500,
    id: "fixture-song-short-cut",
    title: "Short Cut (fixture)",
  }),
  // Deliberately just over the minimum: the selector must cope with a song
  // that can hold barely more than one excerpt.
  Object.freeze({
    artistLabel: "Fixture artist",
    durationMs: 8_200,
    id: "fixture-song-interlude",
    title: "Interlude (fixture)",
  }),
]);

export function findFixtureSong(id: string): FixtureSong | undefined {
  return FIXTURE_SONGS.find((song) => song.id === id);
}

/** Every fixture must be long enough to hold an excerpt, or the flow cannot be
 * exercised with it. Asserted in a test rather than assumed. */
export function fixtureSongsAreExcerptable(): boolean {
  return FIXTURE_SONGS.every((song) => canHoldExcerpt(song.durationMs));
}
