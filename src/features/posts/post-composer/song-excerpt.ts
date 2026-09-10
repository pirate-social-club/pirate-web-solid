/** The playback interval of a song-backed video, in integer milliseconds.
 *
 * Under Spec 013 §5A a song-backed video publishes a server-rendered master
 * whose soundtrack is this interval of the canonical song, so the interval is
 * bounded like the video itself: 3 to 180 seconds, and contained within the
 * song. It is not the Dance segment. Spec 021's scored segment is a separate,
 * opt-in, later-authored 6 to 30 seconds chosen on an already-published video,
 * and publishing an ordinary song-backed video does not create one. This module
 * enforced the Dance limit until 2026-09-10, which conflated the two.
 *
 * These are integers because the server takes them exactly: whole milliseconds
 * at 48 kHz convert to samples without loss. The client's limits mirror the
 * server's policy for feedback only. The server revalidates at reservation,
 * against the canonical song's own duration, and its answer is the authority.
 */
export const MIN_EXCERPT_MS = 3_000;
export const MAX_EXCERPT_MS = 180_000;

export type ExcerptBounds = { readonly startMs: number; readonly endMs: number };

const whole = (value: number) => Math.round(Number.isFinite(value) ? value : 0);
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** A song shorter than the minimum cannot host an excerpt at all. */
export function canHoldExcerpt(songDurationMs: number): boolean {
  return whole(songDurationMs) >= MIN_EXCERPT_MS;
}

/** The longest excerpt this song can hold. */
export function maxExcerptMs(songDurationMs: number): number {
  return Math.min(MAX_EXCERPT_MS, whole(songDurationMs));
}

/** Where a selection starts when the author has not chosen one. Deliberately
 * the opening of the song rather than a guess at a chorus: a default that
 * pretends to be clever is worse than one the author can see is arbitrary. */
export function defaultExcerpt(songDurationMs: number): ExcerptBounds {
  const duration = whole(songDurationMs);
  return { startMs: 0, endMs: Math.min(duration, MAX_EXCERPT_MS) };
}

/** Move the whole excerpt, preserving its length. This is what dragging the
 * selected span does: the phrase is scrubbed through the song rather than
 * stretched, and it shortens only when it runs into the end of the song.
 * Distinct from dragging an endpoint, which resizes. */
export function moveExcerpt(
  bounds: ExcerptBounds,
  nextStartMs: number,
  songDurationMs: number,
): ExcerptBounds {
  const duration = whole(songDurationMs);
  const length = clamp(bounds.endMs - bounds.startMs, MIN_EXCERPT_MS, maxExcerptMs(duration));
  const startMs = clamp(whole(nextStartMs), 0, Math.max(0, duration - MIN_EXCERPT_MS));
  return { startMs, endMs: clamp(startMs + length, startMs + MIN_EXCERPT_MS, duration) };
}

/** Resize from the start. The end holds, so this changes the length rather
 * than the position. Dragging the start must not move the end, which is why
 * this is separate from `moveExcerpt`. */
export function resizeExcerptStart(
  bounds: ExcerptBounds,
  nextStartMs: number,
  songDurationMs: number,
): ExcerptBounds {
  const duration = whole(songDurationMs);
  const endMs = clamp(bounds.endMs, MIN_EXCERPT_MS, duration);
  const highest = endMs - MIN_EXCERPT_MS;
  const lowest = Math.max(0, endMs - MAX_EXCERPT_MS);
  return { startMs: clamp(whole(nextStartMs), lowest, Math.max(lowest, highest)), endMs };
}

/** Resize from the end. The start holds. */
export function resizeExcerptEnd(
  bounds: ExcerptBounds,
  nextEndMs: number,
  songDurationMs: number,
): ExcerptBounds {
  const duration = whole(songDurationMs);
  const startMs = clamp(bounds.startMs, 0, Math.max(0, duration - MIN_EXCERPT_MS));
  const lowest = startMs + MIN_EXCERPT_MS;
  const highest = Math.min(duration, startMs + MAX_EXCERPT_MS);
  return { startMs, endMs: clamp(whole(nextEndMs), lowest, Math.max(lowest, highest)) };
}

/** Force an arbitrary pair into range, for values arriving from storage or a
 * caller rather than from the two controls above. */
export function clampExcerpt(bounds: ExcerptBounds, songDurationMs: number): ExcerptBounds {
  return resizeExcerptEnd(
    moveExcerpt(
      { startMs: whole(bounds.startMs), endMs: whole(bounds.endMs) },
      whole(bounds.startMs),
      songDurationMs,
    ),
    whole(bounds.endMs),
    songDurationMs,
  );
}

export function excerptLengthMs(bounds: ExcerptBounds): number {
  return bounds.endMs - bounds.startMs;
}

/** True when the bounds are something the server would accept: integers, in
 * order, inside the song, and within the ratified duration range. */
export function isSubmittableExcerpt(bounds: ExcerptBounds, songDurationMs: number): boolean {
  const length = excerptLengthMs(bounds);
  return (
    Number.isInteger(bounds.startMs) &&
    Number.isInteger(bounds.endMs) &&
    bounds.startMs >= 0 &&
    bounds.endMs <= whole(songDurationMs) &&
    length >= MIN_EXCERPT_MS &&
    length <= MAX_EXCERPT_MS
  );
}

/** Display only. Never round-trip a formatted string back into bounds. */
export function formatExcerptTime(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(whole(milliseconds) / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
