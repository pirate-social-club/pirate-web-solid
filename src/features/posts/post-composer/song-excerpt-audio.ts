import type { ExcerptBounds } from "./song-excerpt";

/** Audible fixture audio for excerpt preview.
 *
 * The audio is synthesized rather than bundled. A generated tone carries no
 * third-party rights at all, which is a stronger guarantee than asserting that
 * some shipped file is clear, and it keeps a binary out of the repository.
 *
 * It is deliberately position-dependent: the pitch steps every bar, so moving
 * the excerpt sounds different rather than merely looking different. Without
 * that, an audible preview would prove only that something played, not that the
 * selected span is what played.
 *
 * This is not music and is never presented as a song.
 */
export const BAR_MS = 2_000;

/** A fixed pentatonic ladder, so consecutive bars are distinguishable by ear
 * without being unpleasant across a thirty-second span. */
const SCALE_HZ = [220, 247, 277, 330, 370, 440, 494, 554] as const;

export function barIndexAt(positionMs: number): number {
  return Math.max(0, Math.floor(positionMs / BAR_MS));
}

export function frequencyAt(positionMs: number): number {
  const index = barIndexAt(positionMs);
  // SAFETY: the modulo keeps the index inside the fixed scale array.
  return SCALE_HZ[index % SCALE_HZ.length] ?? SCALE_HZ[0];
}

export type ToneStep = { readonly frequencyHz: number; readonly offsetMs: number };

/** The tone changes an excerpt would sound, as offsets from the start of the
 * excerpt. Pure, so the audible behaviour is testable without an audio device:
 * the first step is always at offset zero, steps land on bar boundaries, and
 * nothing is scheduled at or past the end of the excerpt. */
export function excerptToneSchedule(bounds: ExcerptBounds): readonly ToneStep[] {
  const steps: ToneStep[] = [{ frequencyHz: frequencyAt(bounds.startMs), offsetMs: 0 }];
  const firstBar = (barIndexAt(bounds.startMs) + 1) * BAR_MS;
  for (let position = firstBar; position < bounds.endMs; position += BAR_MS) {
    steps.push({ frequencyHz: frequencyAt(position), offsetMs: position - bounds.startMs });
  }
  return steps;
}

export type ExcerptPlayer = {
  readonly close: () => void;
  /** Resolves when the excerpt finishes or is stopped. */
  readonly play: (bounds: ExcerptBounds, onEnded: () => void) => void;
  readonly stop: () => void;
};

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | undefined {
  if (!("AudioContext" in globalThis)) return undefined;
  const candidate = globalThis.AudioContext;
  return typeof candidate === "function" ? candidate : undefined;
}

/** Plays exactly the selected span and stops there.
 *
 * The stop is scheduled with the audio clock rather than a timer, so the end of
 * the excerpt is not at the mercy of a slow frame — the same reason the visual
 * playhead clamps rather than trusting elapsed time. Returns a player that does
 * nothing when the platform has no Web Audio, so the surface still runs.
 */
export function createExcerptPlayer(): ExcerptPlayer {
  const Constructor = audioContextConstructor();
  if (!Constructor) {
    return { close: () => undefined, play: (_bounds, onEnded) => onEnded(), stop: () => undefined };
  }
  let context: AudioContext | undefined;
  let active: { gain: GainNode; oscillator: OscillatorNode } | undefined;

  const teardown = () => {
    if (!active) return;
    active.oscillator.onended = null;
    try {
      active.oscillator.stop();
    } catch {
      // Already stopped: the excerpt ran to its end.
    }
    active.oscillator.disconnect();
    active.gain.disconnect();
    active = undefined;
  };

  return {
    close: () => {
      teardown();
      void context?.close();
      context = undefined;
    },
    play: (bounds, onEnded) => {
      teardown();
      context ??= new Constructor();
      void context.resume();
      const startAt = context.currentTime;
      const lengthSeconds = Math.max(0, (bounds.endMs - bounds.startMs) / 1_000);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      for (const step of excerptToneSchedule(bounds)) {
        oscillator.frequency.setValueAtTime(step.frequencyHz, startAt + step.offsetMs / 1_000);
      }
      // Short fades, so a bar change or the end of the excerpt does not click.
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(0.14, startAt + 0.02);
      gain.gain.setValueAtTime(0.14, startAt + Math.max(0.04, lengthSeconds - 0.03));
      gain.gain.linearRampToValueAtTime(0, startAt + lengthSeconds);
      oscillator.connect(gain).connect(context.destination);
      oscillator.onended = () => {
        active = undefined;
        onEnded();
      };
      oscillator.start(startAt);
      oscillator.stop(startAt + lengthSeconds);
      active = { gain, oscillator };
    },
    stop: teardown,
  };
}
