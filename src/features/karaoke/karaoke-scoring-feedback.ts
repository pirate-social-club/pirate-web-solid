import type { KaraokeLineScore } from "./runtime";
import type { KaraokeScoringState } from "./scoring/karaoke-scoring-controller";
import type { KaraokeLineRating } from "./karaoke-lyric-stage";

export const RATING_PERFECT_THRESHOLD = 0.9;
export const RATING_GREAT_THRESHOLD = 0.75;
const RATING_GOOD_THRESHOLD = 0.5;
export const COMBO_THRESHOLD = RATING_GOOD_THRESHOLD;

export type RatingTier = "perfect" | "great" | "good" | "miss";

export function ratingTierForScore(score: number): RatingTier {
  if (score >= RATING_PERFECT_THRESHOLD) return "perfect";
  if (score >= RATING_GREAT_THRESHOLD) return "great";
  if (score >= RATING_GOOD_THRESHOLD) return "good";
  return "miss";
}

const RATING_LABEL: Record<RatingTier, string> = {
  perfect: "Perfect",
  great: "Great",
  good: "Good",
  miss: "Miss",
};

const RATING_TONE: Record<RatingTier, KaraokeLineRating["tone"]> = {
  perfect: "success",
  great: "info",
  good: "warning",
  miss: "destructive",
};

export interface KaraokeFeedback {
  runningScore: number;
  combo: number;
  bestCombo: number;
  rating: KaraokeLineRating | null;
}

const EMPTY_FEEDBACK: KaraokeFeedback = { bestCombo: 0, combo: 0, rating: null, runningScore: 0 };

/** Derives the transient rating pop for the most recently finalized line. */
export function deriveKaraokeFeedback(state: KaraokeScoringState | null): KaraokeFeedback {
  if (!state || state.lineScores.length === 0) return EMPTY_FEEDBACK;

  const ordered = [...state.lineScores].sort((a, b) => a.scoredLineIndex - b.scoredLineIndex);
  let runningScore = 0;
  let combo = 0;
  let bestCombo = 0;
  for (const line of ordered) {
    if (line.uncertain) continue;
    runningScore += Math.round(line.score * 100);
    if (ratingTierForScore(line.score) === "miss") combo = 0;
    else {
      combo += 1;
      bestCombo = Math.max(bestCombo, combo);
    }
  }

  const latest = state.latestLineId
    ? ordered.find((line: KaraokeLineScore) => line.lineId === state.latestLineId) ?? null
    : null;
  if (!latest || latest.uncertain) return { bestCombo, combo, rating: null, runningScore };

  const tier = ratingTierForScore(latest.score);
  return {
    bestCombo,
    combo,
    rating: {
      lineId: latest.lineId,
      key: `${latest.lineId}:${latest.scoredLineIndex}:${latest.score}`,
      label: RATING_LABEL[tier],
      points: Math.round(latest.score * 100),
      tone: RATING_TONE[tier],
    },
    runningScore,
  };
}
