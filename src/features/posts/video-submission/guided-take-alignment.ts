import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output } from "mediabunny";

/** Aligning a guided take to the song.
 *
 * The encoder starts before the guide is audible, so the captured video's
 * first moments happen before the song does. The server renders the song at
 * video time zero, so those leading milliseconds would appear as the author
 * moving ahead of the music. Measuring the delay is not compensation; the
 * take is trimmed by exactly that delay so its first frame is the first frame
 * after the guide started.
 *
 * The captured audio is discarded: the server never maps it, and dropping it
 * keeps the upload smaller. The video is copied where it can be and
 * re-encoded only where the trim requires it.
 */

/** Below this the offset is inside measurement noise and no trim is applied. */
export const MIN_ALIGNMENT_MS = 40;

export interface GuidedTakeAlignment {
  readonly file: File;
  /** The leading milliseconds actually removed; zero when nothing was. */
  readonly trimmedMs: number;
  /** False when the take could not be aligned and must not be published with
   * the song: the file is returned untouched so nothing is lost. */
  readonly aligned: boolean;
}

export async function alignGuidedTake(file: File, offsetMs: number): Promise<GuidedTakeAlignment> {
  const requested = Math.round(Number.isFinite(offsetMs) ? offsetMs : 0);
  if (requested < MIN_ALIGNMENT_MS) return { file, trimmedMs: 0, aligned: true };
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const durationSeconds = await input.computeDuration();
    if (!Number.isFinite(durationSeconds) || durationSeconds * 1_000 <= requested) {
      return { file, trimmedMs: 0, aligned: false };
    }
    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: "fragmented", minimumFragmentDuration: 1 }),
      target,
    });
    const conversion = await Conversion.init({
      input,
      output,
      audio: { discard: true },
      trim: { start: requested / 1_000 },
    });
    if (!conversion.isValid) return { file, trimmedMs: 0, aligned: false };
    await conversion.execute();
    if (!target.buffer) return { file, trimmedMs: 0, aligned: false };
    return {
      file: new File([target.buffer], file.name, { type: file.type, lastModified: file.lastModified }),
      trimmedMs: requested,
      aligned: true,
    };
  } catch {
    return { file, trimmedMs: 0, aligned: false };
  } finally {
    input.dispose();
  }
}
