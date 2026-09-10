import { createSignal, onCleanup, Show } from "solid-js";

import { Type } from "../../../design-system";
import { createKaraokeApiClient } from "../../karaoke/karaoke-api";
import { PostComposerExcerptSelector } from "./preview-segment-selector";
import {
  canHoldExcerpt,
  clampExcerpt,
  defaultExcerpt,
  type ExcerptBounds,
  excerptLengthMs,
  formatExcerptTime,
  isSubmittableExcerpt,
} from "./song-excerpt";
import {
  restoreSongExcerpt,
  retainSongExcerpt,
  type SongExcerptDraftStore,
} from "./song-excerpt-draft";
import { parseSongLink } from "./song-excerpt-link";
import { loadSongSource, type SongPayloadReader, type SongSourceState } from "./song-excerpt-source";

/** Choosing a real song by link, hearing the selected excerpt of its canonical
 * audio, adjusting it, and retaining it with the video draft.
 *
 * The link is the temporary way in. There is no catalogue operation to browse
 * songs yet, so a song is named rather than picked from a list; when the
 * community reads expose songs this becomes one of two ways in.
 *
 * The audio is the song's real full mix, read through the Karaoke payload the
 * Karaoke surface already plays. That proves a playback source exists and
 * nothing more. Whether this audio may be rendered into a published video, or
 * cut into a downloadable MP3, is an owner-policy question this surface does
 * not ask and must not appear to answer: both actions are shown as
 * unavailable, and the checks behind them are unbuilt.
 *
 * No fixture is ever substituted here. A song that fails to load says so, in
 * every case, because a surface that quietly played something else would make
 * a broken read look like a working one.
 */
export function SongExcerptComposer(props: {
  read?: SongPayloadReader;
  store: SongExcerptDraftStore;
}) {
  // The store and the reader are captured once, not read per call. A caller
  // writing `store={makeStore()}` passes a prop getter that builds a new store
  // on every access, and the failure is silent: the retain writes into one
  // store and the reopen reads an empty one. Neither is data that changes
  // under this composer, so there is nothing to gain from reading them
  // reactively and a draft to lose.
  const store = props.store;
  const reader = props.read ?? defaultPayloadReader();

  const [link, setLink] = createSignal("");
  const [linkProblem, setLinkProblem] = createSignal<string>();
  const [source, setSource] = createSignal<SongSourceState>({ kind: "idle" });
  const [durationMs, setDurationMs] = createSignal(0);
  const [bounds, setBounds] = createSignal<ExcerptBounds>({ startMs: 0, endMs: 0 });
  const [playing, setPlaying] = createSignal(false);
  const [positionMs, setPositionMs] = createSignal(0);
  const [retained, setRetained] = createSignal<{ bounds: ExcerptBounds; songPostId: string }>();
  const [note, setNote] = createSignal<string>();

  let audio: HTMLAudioElement | undefined;
  let pending: AbortController | undefined;
  // Only the newest load may set state. Aborting the previous one is not
  // enough: a reader that ignores its signal can still resolve late and
  // overwrite the song the person is now looking at.
  let generation = 0;

  // The playhead is watched on animation frames rather than on `timeupdate`,
  // which fires about four times a second and would let the excerpt run up to
  // a quarter second past its end. `timeupdate` stays as a backstop for when
  // frames stop arriving, as they do in a background tab.
  let frame: number | undefined;
  const stopWatching = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
  };
  const watch = () => {
    frame = requestAnimationFrame(() => {
      frame = undefined;
      if (!audio || !playing()) return;
      observe(audio.currentTime * 1_000);
      if (playing()) watch();
    });
  };

  /** The excerpt ends where the author said it ends, not where the song does. */
  const observe = (atMs: number) => {
    setPositionMs(Math.round(atMs));
    if (playing() && atMs >= bounds().endMs) stopPlayback();
  };

  const stopPlayback = () => {
    stopWatching();
    audio?.pause();
    setPlaying(false);
  };

  onCleanup(() => {
    stopWatching();
    audio?.pause();
    pending?.abort();
  });

  const loadSong = async () => {
    const parsed = parseSongLink(link());
    if (parsed.kind === "unsupported") {
      setLinkProblem(parsed.reason);
      return;
    }
    setLinkProblem(undefined);
    stopPlayback();
    setNote(undefined);
    setDurationMs(0);
    setPositionMs(0);
    setBounds({ startMs: 0, endMs: 0 });
    pending?.abort();
    pending = new AbortController();
    const mine = ++generation;
    setSource({ kind: "loading", postId: parsed.postId });
    const next = await loadSongSource(parsed.postId, reader, pending.signal);
    if (mine === generation) setSource(next);
  };

  /** The length comes from the audio element, not from the payload: the element
   * is the thing that will play, so its own idea of the length is the one the
   * bounds have to respect. */
  const noteDuration = (seconds: number) => {
    const total = Math.round(seconds * 1_000);
    if (!Number.isFinite(total) || total <= 0) return;
    setDurationMs(total);
    setBounds((current) =>
      current.endMs > 0 ? clampExcerpt(current, total) : defaultExcerpt(total),
    );
  };

  const changeBounds = (next: ExcerptBounds) => {
    setBounds(next);
    if (!audio || !playing()) return;
    // Adjusting during playback keeps the playhead inside the new selection,
    // but does not restart on every drag event: a range input emits many, and
    // restarting on each would stutter rather than let the change be heard.
    const atMs = audio.currentTime * 1_000;
    if (atMs < next.startMs || atMs >= next.endMs) {
      audio.currentTime = next.startMs / 1_000;
      setPositionMs(next.startMs);
    }
  };

  const togglePlayback = () => {
    if (!audio) return;
    if (playing()) {
      stopPlayback();
      return;
    }
    audio.currentTime = bounds().startMs / 1_000;
    setPositionMs(bounds().startMs);
    setPlaying(true);
    watch();
    void audio.play().catch(() => {
      // Autoplay refusal and a decode failure both land here, and neither is
      // something to report as playing.
      stopWatching();
      setPlaying(false);
      setNote("That audio would not play in this browser.");
    });
  };

  /** Whether the current selection is one the draft can hold. The selector
   * keeps bounds in range, but it is only rendered once a length is known, and
   * until then the bounds are the zero-length pair the component starts with. */
  const submittable = () => isSubmittableExcerpt(bounds(), durationMs());

  const retain = async (songPostId: string) => {
    if (!submittable()) return;
    await retainSongExcerpt(store, songPostId, bounds());
    setRetained({ bounds: bounds(), songPostId });
    setNote(undefined);
  };

  /** Reopening the draft: discard what is on screen and read it back. */
  const reopen = async (songPostId: string) => {
    // A retained draft is read back against the song's length, so without one
    // there is nothing to check it against — which is not the same as there
    // being no draft, and must not be reported as though it were.
    if (durationMs() <= 0) {
      setNote("The song’s length isn’t known yet, so a retained excerpt can’t be read back.");
      return;
    }
    const restored = await restoreSongExcerpt(store, {
      durationMs: durationMs(),
      id: songPostId,
    });
    if (!restored) {
      setNote("No retained excerpt for this song.");
      return;
    }
    stopPlayback();
    setBounds(restored.bounds);
    setPositionMs(restored.bounds.startMs);
    setNote(`Restored ${restored.bounds.startMs}–${restored.bounds.endMs} ms from the draft.`);
  };

  return (
    <section class="mx-auto grid max-w-md gap-4 p-4">
      <div class="grid gap-2">
        <Type as="h2" variant="h4">1. Choose a song</Type>
        <Type as="p" variant="caption">
          Paste a song link or its post id. Browsing a list of songs isn’t available yet.
        </Type>
        <div class="flex gap-2">
          <input
            aria-label="Song link or post id"
            class="min-w-0 flex-1 rounded-[var(--radius-lg)] border border-border bg-card p-3"
            onInput={(event) => setLink(event.currentTarget.value)}
            placeholder="/p/<post id>"
            type="text"
            value={link()}
          />
          <button
            class="rounded-[var(--radius-lg)] bg-primary p-3 text-primary-foreground"
            onClick={() => void loadSong()}
            type="button"
          >
            Load
          </button>
        </div>
        <Show when={linkProblem()}>
          {(problem) => <Type as="p" variant="caption" role="alert">{problem()}</Type>}
        </Show>
      </div>

      <Show when={source().kind === "loading"}>
        <Type as="p" variant="caption">Loading that song…</Type>
      </Show>
      <Show when={problemOf(source())}>
        {(reason) => <Type as="p" variant="caption" role="alert">{reason()}</Type>}
      </Show>

      <Show when={readyOf(source())}>
        {(ready) => (
          <>
            <audio
              onDurationChange={(event) => noteDuration(event.currentTarget.duration)}
              onEnded={() => stopPlayback()}
              onTimeUpdate={(event) => observe(event.currentTarget.currentTime * 1_000)}
              preload="metadata"
              ref={(element) => {
                audio = element;
              }}
              src={ready().audioUrl}
            />

            <div class="grid gap-2">
              <Type as="h2" variant="h4">2. Adjust the excerpt</Type>
              <Type as="p" variant="body">{ready().title}</Type>
              <Show
                fallback={
                  <Type as="p" variant="caption">
                    {durationMs() > 0
                      ? "That song is too short to hold a six second excerpt."
                      : "Reading the song’s length…"}
                  </Type>
                }
                when={durationMs() > 0 && canHoldExcerpt(durationMs())}
              >
                <PostComposerExcerptSelector
                  bounds={bounds()}
                  onChange={changeBounds}
                  onTogglePreview={togglePlayback}
                  playing={playing()}
                  songDurationMs={durationMs()}
                />
                <Type as="p" variant="caption" class="tabular-nums">
                  start {bounds().startMs} ms · end {bounds().endMs} ms · length{" "}
                  {excerptLengthMs(bounds())} ms ·{" "}
                  {isSubmittableExcerpt(bounds(), durationMs()) ? "in range" : "out of range"}
                </Type>
                <Type as="p" variant="caption" class="tabular-nums">
                  {playing() ? "Playing" : "Stopped"} at {positionMs()} ms · bounded to{" "}
                  {formatExcerptTime(bounds().startMs)}–{formatExcerptTime(bounds().endMs)} of this
                  song’s canonical audio
                </Type>
              </Show>
            </div>

            <div class="grid gap-2">
              <Type as="h2" variant="h4">3. Retain it with the video draft</Type>
              <div class="flex gap-2">
                <button
                  class="flex-1 rounded-[var(--radius-lg)] bg-primary p-3 text-primary-foreground disabled:opacity-50"
                  disabled={!submittable()}
                  onClick={() => void retain(ready().postId)}
                  type="button"
                >
                  Retain excerpt
                </button>
                <button
                  class="flex-1 rounded-[var(--radius-lg)] border border-border p-3"
                  onClick={() => void reopen(ready().postId)}
                  type="button"
                >
                  Reopen draft
                </button>
              </div>
              <Show when={!submittable()}>
                <Type as="p" variant="caption">
                  An excerpt can be retained once it is six to thirty seconds inside a song of
                  known length.
                </Type>
              </Show>
              <Show
                fallback={<Type as="p" variant="caption">Nothing retained yet.</Type>}
                when={retained()}
              >
                {(record) => (
                  <Type as="p" variant="caption" class="tabular-nums">
                    Retained with the draft: song post {record().songPostId} ·{" "}
                    {record().bounds.startMs}–{record().bounds.endMs} ms
                  </Type>
                )}
              </Show>
              <Show when={note()}>
                {(text) => <Type as="p" variant="caption" class="tabular-nums">{text()}</Type>}
              </Show>
            </div>
          </>
        )}
      </Show>

      {/* Visible text rather than a title tooltip: a tooltip is not reachable
          by touch, and this is a phone surface. Neither action is implemented,
          and neither owner-policy check behind them has been made. */}
      <div class="grid gap-2">
        <div class="rounded-[var(--radius-lg)] border border-dashed border-muted-foreground/40 p-3">
          <Type as="p" variant="caption">Publishing isn’t available yet.</Type>
        </div>
        <div class="rounded-[var(--radius-lg)] border border-dashed border-muted-foreground/40 p-3">
          <Type as="p" variant="caption">MP3 download isn’t available yet.</Type>
        </div>
      </div>
    </section>
  );
}

/** Narrowing helpers rather than assertions: the discriminant decides, so
 * nothing is claimed about a state that has not been checked. */
function readyOf(state: SongSourceState) {
  return state.kind === "ready" ? state : undefined;
}

function problemOf(state: SongSourceState): string | undefined {
  return state.kind === "unavailable" || state.kind === "error" ? state.reason : undefined;
}

let sharedReader: SongPayloadReader | undefined;

/** The real read, built once. Nothing here falls back to a fixture. */
function defaultPayloadReader(): SongPayloadReader {
  if (!sharedReader) {
    const client = createKaraokeApiClient();
    sharedReader = (postId, signal) => client.getPayload(postId, signal);
  }
  return sharedReader;
}
