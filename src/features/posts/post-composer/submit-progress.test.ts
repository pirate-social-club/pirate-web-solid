import { describe, expect, test } from "bun:test";

import type { SubmitProgress } from "./types";
import {
  createSubmitProgressReporter,
  parseDetailFraction,
  simpleSubmitProgressSteps,
  songSubmitProgressSteps,
  submitProgressFraction,
  videoSubmitProgressSteps,
} from "./submit-progress";

// Replay an ordered list of [key, detail?] emissions through the real reporter and
// return the fraction the bar would render for each — exactly what production feeds
// the bar, so a bad emission order surfaces as a non-monotonic fraction sequence.
function replayFractions(
  steps: Parameters<typeof createSubmitProgressReporter>[0],
  emissions: Array<[string, string?]>,
): number[] {
  const fractions: number[] = [];
  const report = createSubmitProgressReporter(steps, (p: SubmitProgress) => {
    fractions.push(submitProgressFraction(p));
  });
  for (const [key, detail] of emissions) report(key, detail);
  return fractions;
}

function isNonDecreasing(values: number[]): boolean {
  return values.every((v, i) => i === 0 || v >= values[i - 1]! - 1e-9);
}

function approx(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) < 1e-6;
}

describe("parseDetailFraction", () => {
  test("parses a percentage detail into 0–1, clamped", () => {
    expect(parseDetailFraction("0%")).toBe(0);
    expect(approx(parseDetailFraction("63%") ?? -1, 0.63)).toBe(true);
    expect(parseDetailFraction("100%")).toBe(1);
    expect(parseDetailFraction("250%")).toBe(1);
  });

  test("returns null for non-percentage details", () => {
    expect(parseDetailFraction(undefined)).toBeNull();
    expect(parseDetailFraction("uploading")).toBeNull();
    expect(parseDetailFraction("5/8")).toBeNull();
  });
});

describe("submitProgressFraction — activity (single upload)", () => {
  const activity = (phase: SubmitProgress["phase"], detail?: string): SubmitProgress => ({
    phase,
    label: "x",
    detail,
    currentIndex: 1,
    totalSteps: 3,
    display: "activity",
  });

  test("fills 0 → byte-% → 1 across an image upload", () => {
    expect(submitProgressFraction(activity("validating"))).toBe(0);
    expect(submitProgressFraction(activity("uploading_media"))).toBe(0); // before first byte
    expect(submitProgressFraction(activity("uploading_media", "50%"))).toBe(0.5);
    expect(submitProgressFraction(activity("uploading_media", "100%"))).toBe(1);
    expect(submitProgressFraction(activity("publishing_post"))).toBe(1); // past the upload
  });
});

describe("submitProgressFraction — pipeline monotonicity", () => {
  test("the production video emission order is non-decreasing", () => {
    const fractions = replayFractions(videoSubmitProgressSteps({ monetized: true }), [
      ["validating"],
      ["upload_video", "0%"],
      ["upload_video", "33%"],
      ["upload_video", "66%"],
      ["upload_video", "100%"],
      ["extract_poster"],
      ["upload_poster", "0%"],
      ["upload_poster", "100%"],
      ["publish_post"],
      ["create_listing"],
      ["check_registration"],
      ["done"],
    ]);

    expect(isNonDecreasing(fractions)).toBe(true);
    expect(approx(fractions[0]!, 1 / 7)).toBe(true); // validating
    expect(fractions.at(-1)).toBe(1); // done / registration reaches 100%
  });

  test("the OLD up-front ordering is caught as a backward jump (guard has teeth)", () => {
    const fractions = replayFractions(videoSubmitProgressSteps({ monetized: true }), [
      ["validating"],
      ["upload_video"],
      ["extract_poster"],
      ["upload_video", "18%"],
    ]);

    expect(isNonDecreasing(fractions)).toBe(false);
  });
});

describe("submitProgressFraction — byte-wired song flow is monotonic", () => {
  test("primary audio + aggregated extra-artifact byte reports never decrease", () => {
    const fractions = replayFractions(
      songSubmitProgressSteps({ hasPendingBundle: false, hasExtraArtifacts: true, isLocked: false }),
      [
        ["validating"],
        ["upload_primary_audio", "0%"],
        ["upload_primary_audio", "45%"],
        ["upload_primary_audio", "100%"],
        ["upload_artifacts", "0%"],
        ["upload_artifacts", "30%"],
        ["upload_artifacts", "100%"],
        ["create_bundle"],
        ["check_rights"],
        ["publish_post"],
        ["check_registration"],
        ["done"],
      ],
    );
    expect(isNonDecreasing(fractions)).toBe(true);
    expect(fractions.at(-1)).toBe(1);
  });
});

describe("submitProgressFraction — activity image flow is monotonic", () => {
  test("validating → upload bytes → publish never decreases", () => {
    const fractions = replayFractions(simpleSubmitProgressSteps({ mode: "image", hasMedia: true }), [
      ["validating"],
      ["prepare_media", "0%"],
      ["prepare_media", "40%"],
      ["prepare_media", "100%"],
      ["publish_post"],
      ["done"],
    ]);
    expect(isNonDecreasing(fractions)).toBe(true);
  });
});
