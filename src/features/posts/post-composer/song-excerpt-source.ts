import { type ExcerptBounds } from "./song-excerpt";

/** Resolving a chosen song post into something the excerpt selector can use.
 *
 * The audio comes from the Karaoke payload, which already exposes a real song's
 * full mix and is what the Karaoke surface plays. Reusing it means this
 * increment needs no new API.
 *
 * What that payload proves is narrow, and the states below keep it narrow: a
 * `full_mix` reference establishes that a playback source exists. It does not
 * establish permission to render that audio into a published video, or to cut
 * an MP3 from it, or that the song's owner policy allows either. Those checks
 * are downstream and unbuilt, so nothing here may be read as clearing them.
 */
export type SongSourceState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading"; readonly postId: string }
  | {
      readonly kind: "ready";
      readonly audioUrl: string;
      readonly postId: string;
      readonly title: string;
    }
  | { readonly kind: "unavailable"; readonly postId: string; readonly reason: string }
  | { readonly kind: "error"; readonly postId: string; readonly reason: string };

/** The retained selection names the song post as well as the bounds. Bounds
 * alone would be meaningless against a different song, and publication and
 * extraction both need to know which song these milliseconds belong to. */
export type SongExcerptSelection = {
  readonly bounds: ExcerptBounds;
  readonly postId: string;
};

export type SongPayloadReader = (
  postId: string,
  signal?: AbortSignal,
) => Promise<{ instrumental_audio_url?: string | null; title?: string | null }>;

/** Maps a payload read into a state. Separated from the fetching so every
 * outcome — including the ready-but-silent one — is testable without a network
 * or an audio element. */
export async function loadSongSource(
  postId: string,
  read: SongPayloadReader,
  signal?: AbortSignal,
): Promise<SongSourceState> {
  try {
    const payload = await read(postId, signal);
    const audioUrl = payload.instrumental_audio_url ?? "";
    if (!audioUrl) {
      return {
        kind: "unavailable",
        postId,
        reason: "That song has no playable audio yet.",
      };
    }
    return { kind: "ready", audioUrl, postId, title: payload.title || "Untitled song" };
  } catch (error) {
    // The reason is shown to a person, so it says what to do rather than what
    // threw. The underlying error is not surfaced: it can carry request detail.
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? "Loading was cancelled."
        : "That song could not be loaded. Check the link, or try again.";
    return { kind: "error", postId, reason };
  }
}
