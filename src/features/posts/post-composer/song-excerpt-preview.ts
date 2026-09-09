import { type ExcerptBounds, excerptLengthMs } from "./song-excerpt";

/** The preview playhead, as pure state.
 *
 * There is no song audio behind the fixtures, so this advances a playhead
 * across the selected span rather than playing anything. What it must get right
 * is the part that will still be true with real audio: it begins at `startMs`,
 * never runs past `endMs`, and stops there rather than continuing into the rest
 * of the song. Keeping it pure means those bounds are testable without a timer
 * or an audio element.
 */
export type PreviewState = {
  readonly playing: boolean;
  readonly positionMs: number;
};

export function startPreview(bounds: ExcerptBounds): PreviewState {
  return { playing: true, positionMs: bounds.startMs };
}

export function stopPreview(bounds: ExcerptBounds): PreviewState {
  return { playing: false, positionMs: bounds.startMs };
}

/** Advances by an elapsed interval, stopping exactly at the end of the excerpt.
 * The position never exceeds `endMs`, so a slow frame cannot overshoot into
 * audio the author did not select. */
export function advancePreview(
  state: PreviewState,
  bounds: ExcerptBounds,
  elapsedMs: number,
): PreviewState {
  if (!state.playing) return state;
  const next = state.positionMs + Math.max(0, Math.round(elapsedMs));
  if (next >= bounds.endMs) return { playing: false, positionMs: bounds.endMs };
  return { playing: true, positionMs: Math.max(bounds.startMs, next) };
}

/** A preview in flight when the bounds change follows the new selection rather
 * than continuing through the old one. */
export function reboundPreview(state: PreviewState, bounds: ExcerptBounds): PreviewState {
  if (state.positionMs >= bounds.startMs && state.positionMs <= bounds.endMs) return state;
  return { playing: state.playing, positionMs: bounds.startMs };
}

export function previewProgress(state: PreviewState, bounds: ExcerptBounds): number {
  const length = excerptLengthMs(bounds);
  if (length <= 0) return 0;
  return Math.min(1, Math.max(0, (state.positionMs - bounds.startMs) / length));
}
