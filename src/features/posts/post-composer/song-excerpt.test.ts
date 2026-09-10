import { describe, expect, it } from "vitest";

import {
  canHoldExcerpt,
  clampExcerpt,
  defaultExcerpt,
  excerptLengthMs,
  formatExcerptTime,
  isSubmittableExcerpt,
  MAX_EXCERPT_MS,
  maxExcerptMs,
  MIN_EXCERPT_MS,
  moveExcerpt,
  resizeExcerptEnd,
  resizeExcerptStart,
} from "./song-excerpt";

const SONG = 214_000; // 3:34, a plausible song length.

describe("song excerpt bounds", () => {
  it("defaults to the opening at the maximum length the song allows", () => {
    expect(defaultExcerpt(SONG)).toEqual({ startMs: 0, endMs: MAX_EXCERPT_MS });
    // A song shorter than the maximum yields the whole song, not an excerpt
    // that runs past its end.
    expect(defaultExcerpt(12_000)).toEqual({ startMs: 0, endMs: 12_000 });
  });

  it("refuses to treat a song shorter than the minimum as excerptable", () => {
    expect(canHoldExcerpt(MIN_EXCERPT_MS)).toBe(true);
    expect(canHoldExcerpt(MIN_EXCERPT_MS - 1)).toBe(false);
    expect(maxExcerptMs(12_000)).toBe(12_000);
    expect(maxExcerptMs(SONG)).toBe(MAX_EXCERPT_MS);
  });

  it("dragging the span moves it and preserves its duration", () => {
    const bounds = { startMs: 10_000, endMs: 28_000 };
    const moved = moveExcerpt(bounds, 90_000, SONG);
    expect(moved).toEqual({ startMs: 90_000, endMs: 108_000 });
    expect(excerptLengthMs(moved)).toBe(excerptLengthMs(bounds));
  });

  it("dragging the start resizes without moving the end", () => {
    // The distinction that matters at the controls: an endpoint resizes, the
    // span moves. Moving the start must never drag the end along with it.
    const bounds = { startMs: 40_000, endMs: 60_000 };
    const resized = resizeExcerptStart(bounds, 48_000, SONG);
    expect(resized).toEqual({ startMs: 48_000, endMs: 60_000 });
    expect(excerptLengthMs(resized)).toBe(12_000);
  });

  it("resizing from either endpoint stays within three and 180 seconds", () => {
    // Late enough in the song that the maximum, not the song's opening, is
    // what stops the start from being dragged further back.
    const bounds = { startMs: 190_000, endMs: 200_000 };
    // Dragged past the end, and dragged far before it.
    expect(resizeExcerptStart(bounds, 199_000, SONG).startMs).toBe(200_000 - MIN_EXCERPT_MS);
    expect(resizeExcerptStart(bounds, 0, SONG).startMs).toBe(200_000 - MAX_EXCERPT_MS);
    expect(excerptLengthMs(resizeExcerptStart(bounds, 0, SONG))).toBe(MAX_EXCERPT_MS);
  });

  it("shortens rather than overrunning when the span nears the end of the song", () => {
    const moved = moveExcerpt({ startMs: 0, endMs: 30_000 }, SONG - 9_000, SONG);
    expect(moved.endMs).toBe(SONG);
    expect(excerptLengthMs(moved)).toBe(9_000);
  });

  it("holds the start when the end moves, so the end control sets the length", () => {
    const bounds = { startMs: 40_000, endMs: 55_000 };
    expect(resizeExcerptEnd(bounds, 62_000, SONG)).toEqual({ startMs: 40_000, endMs: 62_000 });
  });

  it("keeps the length within three and 180 seconds from either control", () => {
    const bounds = { startMs: 20_000, endMs: 35_000 };
    // Dragged far below the minimum and far above the maximum.
    expect(excerptLengthMs(resizeExcerptEnd(bounds, 20_100, SONG))).toBe(MIN_EXCERPT_MS);
    expect(excerptLengthMs(resizeExcerptEnd(bounds, 999_999, SONG))).toBe(MAX_EXCERPT_MS);
    // The span cannot move so late that three seconds no longer fit.
    expect(moveExcerpt(bounds, SONG, SONG).startMs).toBe(SONG - MIN_EXCERPT_MS);
  });

  it("clamps values arriving from storage rather than trusting them", () => {
    // Reversed, out of range and fractional input all become submittable
    // bounds, because these numbers are what publication and extraction use.
    const clamped = clampExcerpt({ startMs: -5_000.4, endMs: 999_999.6 }, SONG);
    expect(isSubmittableExcerpt(clamped, SONG)).toBe(true);
    expect(clamped).toEqual({ startMs: 0, endMs: MAX_EXCERPT_MS });
  });

  it("treats non-integer or out-of-range bounds as unsubmittable", () => {
    expect(isSubmittableExcerpt({ startMs: 0, endMs: MAX_EXCERPT_MS }, SONG)).toBe(true);
    expect(isSubmittableExcerpt({ startMs: 0.5, endMs: 10_000 }, SONG)).toBe(false);
    expect(isSubmittableExcerpt({ startMs: 0, endMs: MIN_EXCERPT_MS - 1 }, SONG)).toBe(false);
    expect(isSubmittableExcerpt({ startMs: 0, endMs: MAX_EXCERPT_MS + 1 }, SONG)).toBe(false);
    expect(isSubmittableExcerpt({ startMs: 0, endMs: SONG + 1 }, SONG)).toBe(false);
  });

  it("every adjustment yields integers, because the server is given these", () => {
    let bounds = defaultExcerpt(SONG);
    for (const value of [12_345.7, 60_000.2, 199_999.9, -4.4]) {
      bounds = moveExcerpt(bounds, value, SONG);
      expect(Number.isInteger(bounds.startMs)).toBe(true);
      expect(Number.isInteger(bounds.endMs)).toBe(true);
      bounds = resizeExcerptStart(bounds, value, SONG);
      expect(Number.isInteger(bounds.startMs)).toBe(true);
      expect(Number.isInteger(bounds.endMs)).toBe(true);
      bounds = resizeExcerptEnd(bounds, value, SONG);
      expect(Number.isInteger(bounds.startMs)).toBe(true);
      expect(Number.isInteger(bounds.endMs)).toBe(true);
    }
  });

  it("formats for display without becoming a source of truth", () => {
    expect(formatExcerptTime(0)).toBe("0:00");
    expect(formatExcerptTime(9_400)).toBe("0:09");
    expect(formatExcerptTime(214_000)).toBe("3:34");
  });
});
