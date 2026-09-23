import { describe, expect, test } from "vitest";

import { karaokeResultsView, type KaraokeResultsSummary } from "./karaoke-results-model";

function summary(patch: Partial<KaraokeResultsSummary> = {}): KaraokeResultsSummary {
  return {
    finalScore: 0.82,
    lyricsScore: 0.88,
    timingScore: 0.7,
    scoredLineCount: 12,
    uncertainLineCount: 0,
    timingTrend: "on_time",
    ...patch,
  };
}

describe("karaoke results view", () => {
  test("shows the server score, lyrics accuracy, timing trend and best combo", () => {
    const view = karaokeResultsView(summary(), 6);
    expect(view.scorePercent).toBe(82);
    expect(view.heading).toBe("Great work!");
    expect(view.stats.map(stat => [stat.label, stat.value])).toEqual([["Lyrics", "88%"], ["Timing", "On time"], ["Best combo", "×6"]]);
    expect(view.note).toBeUndefined();
  });

  test("says timing was not scored rather than inventing a value", () => {
    expect(karaokeResultsView(summary({ timingScore: null, timingTrend: "late" }), 0).stats[1]).toMatchObject({ label: "Timing", value: "Not scored" });
  });

  test("explains unmeasured lines instead of counting them against the singer", () => {
    expect(karaokeResultsView(summary({ uncertainLineCount: 1 }), 2).note).toBe("1 line couldn't be measured, so it doesn't count toward your score.");
    expect(karaokeResultsView(summary({ uncertainLineCount: 3 }), 2).note).toBe("3 lines couldn't be measured, so they don't count toward your score.");
  });

  test("shows no score when nothing was recognised or no summary arrived", () => {
    expect(karaokeResultsView(summary({ scoredLineCount: 0, finalScore: 0 }), 0)).toMatchObject({ scorePercent: null, heading: "No lines scored", stats: [] });
    expect(karaokeResultsView(null, 4)).toMatchObject({ scorePercent: null, heading: "Take ended", stats: [] });
  });
});
