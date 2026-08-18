import { describe, expect, test } from "bun:test";
import type { KaraokeLineScore } from "./runtime";
import type { KaraokeScoringState } from "./scoring/karaoke-scoring-controller";
import {
  COMBO_THRESHOLD,
  RATING_GREAT_THRESHOLD,
  RATING_PERFECT_THRESHOLD,
  deriveKaraokeFeedback,
  ratingTierForScore,
} from "./karaoke-scoring-feedback";

function lineScore(lineId: string, scoredLineIndex: number, score: number, uncertain = false): KaraokeLineScore {
  return {
    confidenceScore: null,
    finalizedReason: "line_end",
    lineId,
    lineIndex: scoredLineIndex,
    recognizedWords: [],
    score,
    scoredLineIndex,
    textScore: {
      confidenceMean: null,
      keywordCoverage: score,
      missedWords: [],
      phoneticAvailable: false,
      phoneticCoverage: 0,
      phoneticQuality: 0,
      score,
      wer: 1 - score,
    },
    timingScore: null,
    transcript: "",
    uncertain,
  };
}

function state(scores: KaraokeLineScore[], latestLineId = scores.at(-1)?.lineId ?? null): KaraokeScoringState {
  return {
    error: null,
    latestLineId,
    lineScores: scores,
    micError: null,
    partialTranscript: "",
    phase: "live",
    status: "active",
    summary: null,
  };
}

describe("karaoke scoring feedback", () => {
  test("uses the legacy rating thresholds", () => {
    expect(ratingTierForScore(RATING_PERFECT_THRESHOLD)).toBe("perfect");
    expect(ratingTierForScore(RATING_GREAT_THRESHOLD)).toBe("great");
    expect(ratingTierForScore(COMBO_THRESHOLD)).toBe("good");
    expect(ratingTierForScore(0.49)).toBe("miss");
  });

  test("derives the latest rating and points", () => {
    const feedback = deriveKaraokeFeedback(state([lineScore("line-1", 0, 0.92)], "line-1"));
    expect(feedback.rating).toMatchObject({ label: "Perfect", points: 92, tone: "success" });
    expect(feedback.rating?.key).toBe("line-1:0:0.92");
  });

  test("accumulates points and resets combo on a miss", () => {
    const feedback = deriveKaraokeFeedback(state([
      lineScore("a", 0, 0.9),
      lineScore("b", 1, 0.6),
      lineScore("c", 2, 0.3),
      lineScore("d", 3, 0.8),
    ]));
    expect(feedback.runningScore).toBe(260);
    expect(feedback.combo).toBe(1);
    expect(feedback.bestCombo).toBe(2);
  });

  test("does not penalize uncertain lines", () => {
    const feedback = deriveKaraokeFeedback(state([
      lineScore("a", 0, 0.9),
      lineScore("b", 1, 0, true),
      lineScore("c", 2, 0.8),
    ]));
    expect(feedback.runningScore).toBe(170);
    expect(feedback.combo).toBe(2);
    expect(feedback.rating?.label).toBe("Great");
  });
});
