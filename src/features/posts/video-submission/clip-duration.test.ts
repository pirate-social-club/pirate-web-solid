import { describe, expect, it } from "vitest";

import {
  CAPTURE_ADMISSION_LIMIT_MS,
  CAPTURE_ADMISSION_MARGIN_MS,
  CAPTURE_TAIL_GUARD_MS,
  captureStopAfterMs,
  clipFitMessage,
  fitClipToExcerpt,
  SUPPORTED_RECORDED_EXCERPT_MS,
  TRIM_NOTICE_EPSILON_MS,
} from "./clip-duration";

const EXCERPT = { startMs: 31_000, endMs: 43_000 }; // 12 seconds.

describe("clip duration against the chosen excerpt", () => {
  it("accepts a clip exactly the excerpt's length", () => {
    expect(fitClipToExcerpt(12_000, EXCERPT)).toEqual({ kind: "exact" });
  });

  it("accepts ordinary frame rounding without calling it a trim", () => {
    expect(fitClipToExcerpt(12_000 + TRIM_NOTICE_EPSILON_MS, EXCERPT)).toEqual({ kind: "exact" });
  });

  it("explains trimming when the clip runs past the excerpt", () => {
    const fit = fitClipToExcerpt(20_000, EXCERPT);
    expect(fit).toEqual({ kind: "trims", clipDurationMs: 20_000, discardedMs: 8_000 });
    expect(clipFitMessage(fit)).toContain("trimmed");
  });

  it("rejects a clip shorter than the excerpt with the shortfall named", () => {
    const fit = fitClipToExcerpt(9_000, EXCERPT);
    expect(fit).toEqual({ kind: "too_short", clipDurationMs: 9_000, shortfallMs: 3_000 });
    const message = clipFitMessage(fit);
    expect(message).toContain("0:09");
    expect(message).toContain("0:12");
    expect(message).toContain("cannot be stretched");
  });

  it("fails closed on a measurement it cannot use", () => {
    // The server measures the sealed upload; an unmeasured clip is not
    // evidence that the combination is impossible.
    for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, 0, -10]) {
      expect(fitClipToExcerpt(value, EXCERPT)).toEqual({ kind: "unmeasured" });
    }
    expect(fitClipToExcerpt(12_000, { startMs: 10.5, endMs: 12.5 })).toEqual({ kind: "unmeasured" });
    expect(clipFitMessage({ kind: "unmeasured" })).toBeUndefined();
  });

  it("records past the excerpt's end so frame rounding cannot make the take short", () => {
    expect(captureStopAfterMs(EXCERPT)).toBe(12_000 + CAPTURE_TAIL_GUARD_MS);
  });
});


describe("the supported recorded excerpt stays inside the admission limit", () => {
  it("reserves the capture tail and the AAC margin under 180 seconds", () => {
    expect(SUPPORTED_RECORDED_EXCERPT_MS).toBe(178_700);
    expect(SUPPORTED_RECORDED_EXCERPT_MS + CAPTURE_TAIL_GUARD_MS + CAPTURE_ADMISSION_MARGIN_MS)
      .toBe(CAPTURE_ADMISSION_LIMIT_MS);
    expect(captureStopAfterMs({ startMs: 0, endMs: SUPPORTED_RECORDED_EXCERPT_MS }))
      .toBe(CAPTURE_ADMISSION_LIMIT_MS - CAPTURE_ADMISSION_MARGIN_MS);
  });

  it("refuses a clip whose container would pass but whose video is too short", () => {
    // A retained audio tail can make the container 8 s while the video track
    // is only 4 s. The render needs frames, so the fit guard compares the
    // measured video duration and refuses before upload.
    const fit = fitClipToExcerpt(4_000, { startMs: 0, endMs: 8_000 });
    expect(fit).toEqual({ kind: "too_short", clipDurationMs: 4_000, shortfallMs: 4_000 });
    expect(clipFitMessage(fit)).toContain("cannot be stretched");
  });
});
