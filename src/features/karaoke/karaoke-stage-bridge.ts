import type { ScorableKaraokeLine, ScorableKaraokeWord } from "./runtime";
import type { KaraokeStageLine, KaraokeStageToken } from "./lyric-transform";

function stageTokensToScorableWords(
  tokens: readonly KaraokeStageToken[] | undefined,
  fallbackText: string,
  lineStartMs: number,
  lineEndMs: number,
): ScorableKaraokeWord[] {
  if (!tokens || tokens.length === 0) {
    return [{ endMs: lineEndMs, startMs: lineStartMs, text: fallbackText }];
  }
  return tokens.map((token) => ({ endMs: token.endMs, startMs: token.startMs, text: token.text }));
}

/** Derives scoring identities from the same normalized lines shown on stage. */
export function toScorableKaraokeLines(lines: readonly KaraokeStageLine[]): ScorableKaraokeLine[] {
  return lines
    .filter((line) => line.startMs < line.endMs)
    .map((line, index) => ({
      endMs: line.endMs,
      lineId: line.id,
      lineIndex: index,
      scoredLineIndex: index,
      startMs: line.startMs,
      text: line.text,
      words: stageTokensToScorableWords(line.tokens, line.text, line.startMs, line.endMs),
    }));
}
