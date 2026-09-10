import { KaraokeAvailabilityError } from "../../karaoke/karaoke-api";
import { KaraokeApiError } from "../../karaoke/karaoke-session-bridge";
import { type ExcerptBounds } from "./song-excerpt";

/** Resolving a chosen song post into something the excerpt selector can use.
 *
 * The audio comes from the Karaoke payload, which already exposes a real song's
 * full mix and is what the Karaoke surface plays. Reusing it means this needs
 * no new API.
 *
 * What that payload proves is narrow, and the states below keep it narrow: a
 * `full_mix` reference establishes that a playback source exists. It does not
 * establish permission to render that audio into a published video, or to cut
 * an MP3 from it, or that the song's owner policy allows either. Those checks
 * are downstream and unbuilt, so nothing here may be read as clearing them.
 *
 * The read distinguishes three refusals that mean different things to whoever
 * is looking at the screen, because collapsing them sends people to the wrong
 * fix: a song still being prepared becomes playable on its own, a song without
 * karaoke audio never will, and an age-restricted song is about the viewer
 * rather than the song.
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
  | {
      readonly kind: "unavailable";
      readonly postId: string;
      readonly reason: string;
      readonly retryable: boolean;
    }
  | { readonly kind: "restricted"; readonly postId: string; readonly reason: string }
  | {
      readonly kind: "error";
      readonly postId: string;
      readonly reason: string;
      readonly retryable: boolean;
    };

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
 * or an audio element.
 *
 * The classification happens in the catch clause itself, which is where an
 * unparsed value legitimately arrives, rather than in a helper that would take
 * one as a parameter. The wording is what a person acts on, so it says what to
 * do; the underlying error is never surfaced, because it can carry request
 * detail.
 */
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
        retryable: true,
      };
    }
    return { kind: "ready", audioUrl, postId, title: payload.title || "Untitled song" };
  } catch (error) {
    if (error instanceof KaraokeAvailabilityError) {
      return error.state === "processing"
        ? {
            kind: "unavailable",
            postId,
            reason: "That song is still being prepared. Its audio isn’t ready to excerpt yet.",
            retryable: true,
          }
        : {
            kind: "unavailable",
            postId,
            reason: "That song has no karaoke audio, so there is nothing to excerpt from it.",
            retryable: false,
          };
    }
    if (error instanceof KaraokeApiError && error.code === "age_locked") {
      return {
        kind: "restricted",
        postId,
        reason: "That song is age restricted. Verify your age before using it in a video.",
      };
    }
    if (error instanceof Error && error.name === "AbortError") {
      return { kind: "error", postId, reason: "Loading was cancelled.", retryable: true };
    }
    return {
      kind: "error",
      postId,
      reason: "That song could not be loaded. Check the link, or try again.",
      retryable: error instanceof KaraokeApiError ? error.retryable : true,
    };
  }
}
