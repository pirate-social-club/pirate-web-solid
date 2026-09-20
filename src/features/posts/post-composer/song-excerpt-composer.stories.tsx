import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { SongExcerptComposer } from "./song-excerpt-composer";
import {
  parseStoredExcerptDraft,
  type SongExcerptDraft,
  type SongExcerptDraftStore,
} from "./song-excerpt-draft";
import { SongSourceError, type SongSourceReader } from "./song-excerpt-source";

/** A stand-in for a real song's canonical audio, generated here in the story.
 *
 * The composer itself never substitutes anything: given a post id it reads the
 * Karaoke payload and plays whatever that returns, and says so plainly when it
 * returns nothing. But Storybook has no session and no reachable audio host, so
 * a story that wanted to demonstrate audible bounded playback would otherwise
 * demonstrate the error state instead.
 *
 * The tone steps pitch every two seconds, so moving the excerpt sounds
 * different rather than merely looking different — a preview that always
 * sounded the same would prove only that something played.
 */
const BAR_MS = 2_000;
// A fixed pentatonic ladder, so consecutive bars are distinguishable by ear
// without being unpleasant across a thirty-second span.
const SCALE_HZ = [220, 247, 277, 330, 370, 440, 494, 554] as const;

function frequencyAt(positionMs: number): number {
  const index = Math.max(0, Math.floor(positionMs / BAR_MS));
  // SAFETY: the modulo keeps the index inside the fixed scale array.
  return SCALE_HZ[index % SCALE_HZ.length] ?? SCALE_HZ[0];
}

function toneWavUrl(durationMs: number): string {
  const rate = 8_000;
  const samples = Math.floor((durationMs / 1_000) * rate);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples * 2, true);

  // Phase is accumulated rather than recomputed, so a pitch change lands
  // without a click.
  let phase = 0;
  for (let index = 0; index < samples; index += 1) {
    phase += (2 * Math.PI * frequencyAt((index / rate) * 1_000)) / rate;
    view.setInt16(44 + index * 2, Math.round(Math.sin(phase) * 0.25 * 32_767), true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

/** In-memory draft store for the stories; the app uses the localStorage one. */
function memoryStore(): SongExcerptDraftStore {
  let stored: string | null = null;
  return {
    load: async () => (stored === null ? null : parseStoredExcerptDraft(JSON.parse(stored))),
    save: async (draft: SongExcerptDraft) => {
      stored = JSON.stringify(draft);
    },
  };
}

function standInReader(title: string, durationMs: number): SongSourceReader {
  const audioUrl = toneWavUrl(durationMs);
  return async request => ({
    postId: request.kind === "post" ? request.postId : "resolved-from-slug",
    audioUrl,
    title,
  });
}

const meta = {
  title: "Flows/Posts/VideoPost/SongExcerptByLink",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Choosing a real song by an ordinary post link, hearing the fixed window of its full mix, and keeping it with the video draft automatically. The audio is the song playback access grant, the same read the song player uses; it needs nothing from Karaoke. A slug link, a /p/<post id> link and a bare post id all resolve. The composer never substitutes a fixture: loading, unavailable and error are shown as themselves. In these stories the read is stood in for, because Storybook has no session and no reachable audio host — the post ids and the tone are not real, and the story that fails is failing deliberately. What a playable full mix proves is narrow: an audio source exists. Permission to render that audio into a published video is the server's separate decision and is asked through the preflight, never inferred here. What is real everywhere is the selection: one fixed-length window from the bounds module, retained against the song post's id and restored unchanged.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The whole slice. Paste a song post link, a `/p/<post id>` link or a bare post id. */
export const ChooseHearAndRetain: Story = {
  render: () => (
    <SongExcerptComposer
      read={standInReader("Cadence (stand-in audio)", 150_000)}
      store={memoryStore()}
    />
  ),
};

/** A song barely longer than the minimum excerpt, where the controls have
 * almost no room to move. */
export const ShortSong: Story = {
  render: () => (
    <SongExcerptComposer
      read={standInReader("Interlude (stand-in audio)", 8_200)}
      store={memoryStore()}
    />
  ),
};

/** The read never settles, so the loading state stays on screen. */
export const Loading: Story = {
  render: () => (
    <SongExcerptComposer read={() => new Promise(() => {})} store={memoryStore()} />
  ),
};

/** A real song whose audio is still being prepared. Not an error, and not
 * something to quietly play a fixture for. */
export const NoAudioYet: Story = {
  render: () => (
    <SongExcerptComposer
      read={async request => ({ postId: request.kind === "post" ? request.postId : "slug", audioUrl: "", title: "Still processing" })}
      store={memoryStore()}
    />
  ),
};

/** The read fails. The reason says what to do; it does not repeat what threw,
 * which can carry request detail. */
export const FailedToLoad: Story = {
  render: () => (
    <SongExcerptComposer
      read={async () => {
        throw new Error("GET /communities/x/posts/y 403");
      }}
      store={memoryStore()}
    />
  ),
};

/** The song is missing or unpublished. Retrying cannot change it, so none is
 * offered. */
export const SongUnavailable: Story = {
  render: () => (
    <SongExcerptComposer
      read={async () => {
        throw new SongSourceError("not_found", "Song not found", false);
      }}
      store={memoryStore()}
    />
  ),
};

/** Playback access is switched off. A different problem from a missing song,
 * and not fixed by changing the link. */
export const PlaybackUnavailable: Story = {
  render: () => (
    <SongExcerptComposer
      read={async () => {
        throw new SongSourceError("playback_unavailable", "off", false);
      }}
      store={memoryStore()}
    />
  ),
};

/** About the viewer rather than the song, so it is kept separate from both. */
export const AgeRestricted: Story = {
  render: () => (
    <SongExcerptComposer
      read={async () => {
        throw new SongSourceError("age_restricted", "locked", false);
      }}
      store={memoryStore()}
    />
  ),
};

/** The payload read succeeds and the audio still does not play: a ref that
 * does not fetch. The surface says so instead of waiting for a length. */
export const AudioWontPlay: Story = {
  render: () => (
    <SongExcerptComposer
      read={async request => ({
        postId: request.kind === "post" ? request.postId : "slug",
        audioUrl: "https://audio.invalid/missing.mp3",
        title: "A song whose audio moved",
      })}
      store={memoryStore()}
    />
  ),
};
