import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";

import { Type } from "../../../design-system";
import { PostComposerExcerptSelector } from "./preview-segment-selector";
import {
  clampExcerpt,
  defaultExcerpt,
  excerptLengthMs,
  formatExcerptTime,
  isSubmittableExcerpt,
} from "./song-excerpt";
import {
  makeSongExcerptDraft,
  parseStoredExcerptDraft,
  restoreSongExcerpt,
  retainSongExcerpt,
  type SongExcerptDraft,
  type SongExcerptDraftStore,
} from "./song-excerpt-draft";
import { FIXTURE_SONGS, type FixtureSong, findFixtureSong } from "./song-excerpt-fixtures";
import {
  advancePreview,
  previewProgress,
  reboundPreview,
  startPreview,
  stopPreview,
} from "./song-excerpt-preview";

/** An in-memory draft store, so the flow can be exercised without persistence.
 * A real draft store would put this on the pending video record. */
export function makeMemoryExcerptDraftStore(seed?: SongExcerptDraft): SongExcerptDraftStore {
  // Serialized on the way in and parsed on the way out, so this behaves like a
  // real store rather than handing back the object it was given.
  let stored: string | null = seed ? JSON.stringify(seed) : null;
  return {
    load: async () => (stored === null ? null : parseStoredExcerptDraft(JSON.parse(stored))),
    save: async (draft: SongExcerptDraft) => {
      stored = JSON.stringify(draft);
    },
  };
}

const TICK_MS = 100;

/** Choose a fixture song, adjust the excerpt, preview exactly that span, and
 * retain it with the video draft.
 *
 * Everything here is fixture behaviour and the surface says so on screen. No
 * audio plays, no song is real, nothing is uploaded, published or downloaded.
 * What is real is the selection: the bounds are integer milliseconds produced
 * by the bounds module, retained and restored unchanged, because those are the
 * values publication and MP3 extraction will use.
 */
export function SongExcerptComposerSurface(props: { store?: SongExcerptDraftStore }) {
  const store = props.store ?? makeMemoryExcerptDraftStore();
  const [song, setSong] = createSignal<FixtureSong | undefined>();
  const [bounds, setBounds] = createSignal(defaultExcerpt(0));
  const [preview, setPreview] = createSignal(stopPreview(defaultExcerpt(0)));
  const [retained, setRetained] = createSignal<{ endMs: number; songId: string; startMs: number }>();
  const [restoredNote, setRestoredNote] = createSignal<string>();

  const chooseSong = (next: FixtureSong) => {
    setSong(next);
    const initial = defaultExcerpt(next.durationMs);
    setBounds(initial);
    setPreview(stopPreview(initial));
    setRestoredNote(undefined);
  };

  const changeBounds = (next: ReturnType<typeof defaultExcerpt>) => {
    setBounds(next);
    setPreview((state) => reboundPreview(state, next));
  };

  createEffect(() => {
    if (!preview().playing) return;
    const timer = setInterval(
      () => setPreview((state) => advancePreview(state, bounds(), TICK_MS)),
      TICK_MS,
    );
    onCleanup(() => clearInterval(timer));
  });

  const retain = async () => {
    const chosen = song();
    if (!chosen) return;
    await retainSongExcerpt(store, chosen.id, bounds());
    setRetained({ ...bounds(), songId: chosen.id });
    setRestoredNote(undefined);
  };

  /** Reopening the draft: discard what is on screen and read it back. */
  const reopen = async () => {
    const chosen = song();
    const restored = await restoreSongExcerpt(store, chosen);
    if (!restored) {
      setRestoredNote("No retained excerpt for this song.");
      return;
    }
    setBounds(restored.bounds);
    setPreview(stopPreview(restored.bounds));
    setRestoredNote(
      `Restored ${restored.bounds.startMs}–${restored.bounds.endMs} ms from the draft.`,
    );
  };

  return (
    <section class="mx-auto grid max-w-md gap-4 p-4">
      <div class="rounded-[var(--radius-xl)] border border-dashed border-muted-foreground/40 bg-muted/30 p-3">
        <Type as="p" variant="caption">
          Fixture flow. These songs are not real, no audio plays, and nothing here uploads,
          publishes or downloads anything. Only the excerpt values are real: they are the integer
          milliseconds publication and the MP3 would use.
        </Type>
      </div>

      <div class="grid gap-2">
        <Type as="h2" variant="h4">1. Choose a fixture song</Type>
        <For each={FIXTURE_SONGS}>
          {(candidate) => (
            <button
              aria-pressed={song()?.id === candidate.id ? "true" : "false"}
              class="flex items-center justify-between rounded-[var(--radius-lg)] border border-border bg-card p-3 text-left aria-pressed:border-primary"
              onClick={() => chooseSong(candidate)}
              type="button"
            >
              <span class="grid">
                <Type as="span" variant="body">{candidate.title}</Type>
                <Type as="span" variant="caption" class="text-muted-foreground">
                  {candidate.artistLabel} · {formatExcerptTime(candidate.durationMs)}
                </Type>
              </span>
              <Show when={song()?.id === candidate.id}>
                <Type as="span" variant="caption">Selected</Type>
              </Show>
            </button>
          )}
        </For>
      </div>

      <Show
        when={song()}
        fallback={
          <Type as="p" variant="caption" class="text-muted-foreground">
            Choose a song to select its excerpt.
          </Type>
        }
      >
        {(chosen) => (
          <>
            <div class="grid gap-2">
              <Type as="h2" variant="h4">2. Adjust the excerpt</Type>
              <PostComposerExcerptSelector
                bounds={bounds()}
                onChange={changeBounds}
                onTogglePreview={() =>
                  setPreview((state) =>
                    state.playing ? stopPreview(bounds()) : startPreview(bounds()))}
                playing={preview().playing}
                songDurationMs={chosen().durationMs}
              />
              <Type as="p" variant="caption" class="text-muted-foreground tabular-nums">
                start {bounds().startMs} ms · end {bounds().endMs} ms · length{" "}
                {excerptLengthMs(bounds())} ms ·{" "}
                {isSubmittableExcerpt(bounds(), chosen().durationMs) ? "in range" : "out of range"}
              </Type>
            </div>

            <div class="grid gap-2">
              <Type as="h2" variant="h4">3. Preview that exact span</Type>
              <div class="rounded-[var(--radius-xl)] bg-card p-3">
                <div class="mb-2 h-1.5 rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary transition-[width] duration-100"
                    style={{ width: `${previewProgress(preview(), bounds()) * 100}%` }}
                  />
                </div>
                <Type as="p" variant="caption" class="text-muted-foreground tabular-nums">
                  {preview().playing ? "Playing" : "Stopped"} at {preview().positionMs} ms ·
                  bounded to {formatExcerptTime(bounds().startMs)}–
                  {formatExcerptTime(bounds().endMs)} · silent fixture playhead
                </Type>
              </div>
            </div>

            <div class="grid gap-2">
              <Type as="h2" variant="h4">4. Retain it with the video draft</Type>
              <div class="flex gap-2">
                <button
                  class="flex-1 rounded-[var(--radius-lg)] bg-primary p-3 text-primary-foreground"
                  onClick={() => void retain()}
                  type="button"
                >
                  Retain excerpt
                </button>
                <button
                  class="flex-1 rounded-[var(--radius-lg)] border border-border p-3"
                  onClick={() => void reopen()}
                  type="button"
                >
                  Reopen draft
                </button>
              </div>
              <Show
                when={retained()}
                fallback={
                  <Type as="p" variant="caption" class="text-muted-foreground">
                    Nothing retained yet.
                  </Type>
                }
              >
                {(record) => (
                  <Type as="p" variant="caption" class="tabular-nums">
                    Retained with the draft: {record().songId} · {record().startMs}–
                    {record().endMs} ms
                  </Type>
                )}
              </Show>
              <Show when={restoredNote()}>
                {(note) => (
                  <Type as="p" variant="caption" class="tabular-nums">{note()}</Type>
                )}
              </Show>
            </div>
          </>
        )}
      </Show>
    </section>
  );
}

/** Exported for a story that opens straight into a restored draft. */
export function seededExcerptDraftStore(songId: string, startMs: number, endMs: number) {
  const song = findFixtureSong(songId);
  const bounds = song ? clampExcerpt({ startMs, endMs }, song.durationMs) : { startMs, endMs };
  return makeMemoryExcerptDraftStore(makeSongExcerptDraft(songId, bounds));
}
