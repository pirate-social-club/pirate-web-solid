import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { KaraokeAvailabilityError } from "../../karaoke/karaoke-api";
import { KaraokeApiError } from "../../karaoke/karaoke-session-bridge";
import { SongExcerptComposer } from "./song-excerpt-composer";
import { frequencyAt } from "./song-excerpt-audio";
import { makeMemoryExcerptDraftStore } from "./song-excerpt-surface";
import type { SongPayloadReader } from "./song-excerpt-source";

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

function standInReader(title: string, durationMs: number): SongPayloadReader {
  const audioUrl = toneWavUrl(durationMs);
  return async () => ({ instrumental_audio_url: audioUrl, title });
}

const meta = {
  title: "Flows/Posts/VideoPost/SongExcerptByLink",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Choosing a real song by link, hearing the selected excerpt of its canonical audio, adjusting it, and reopening the draft with the exact bounds restored. A link is the temporary way in because no catalogue operation exists to browse songs yet; a /p/<post id> link or a bare post id resolves through the Karaoke payload, which is the same read the Karaoke surface plays. A slug link is reported as unsupported rather than guessed at. The composer never substitutes a fixture: loading, unavailable and error are shown as themselves. In these stories the payload read is stood in for, because Storybook has no session and no reachable audio host — the post ids and the tone are not real, and the story that fails is failing deliberately. What a playable full mix proves is narrow: an audio source exists. It does not establish permission to render that audio into a published video or to cut an MP3 from it, so both actions are shown as unavailable and the owner-policy checks behind them remain unbuilt. What is real everywhere is the selection: integer milliseconds from the bounds module, retained against the song post's id and restored unchanged.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The whole slice. Paste `/p/abc123def456` — or any post id — and load. */
export const ChooseHearAndRetain: Story = {
  render: () => (
    <SongExcerptComposer
      read={standInReader("Cadence (stand-in audio)", 150_000)}
      store={makeMemoryExcerptDraftStore()}
    />
  ),
};

/** A song barely longer than the minimum excerpt, where the controls have
 * almost no room to move. */
export const ShortSong: Story = {
  render: () => (
    <SongExcerptComposer
      read={standInReader("Interlude (stand-in audio)", 8_200)}
      store={makeMemoryExcerptDraftStore()}
    />
  ),
};

/** The read never settles, so the loading state stays on screen. */
export const Loading: Story = {
  render: () => (
    <SongExcerptComposer read={() => new Promise(() => {})} store={makeMemoryExcerptDraftStore()} />
  ),
};

/** A real song whose audio is still being prepared. Not an error, and not
 * something to quietly play a fixture for. */
export const NoAudioYet: Story = {
  render: () => (
    <SongExcerptComposer
      read={async () => ({ instrumental_audio_url: null, title: "Still processing" })}
      store={makeMemoryExcerptDraftStore()}
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
      store={makeMemoryExcerptDraftStore()}
    />
  ),
};

/** Still being prepared. Retrying can change this answer, so a retry is
 * offered. */
export const StillProcessing: Story = {
  render: () => (
    <SongExcerptComposer
      read={async () => {
        throw new KaraokeAvailabilityError("processing", "still_processing");
      }}
      store={makeMemoryExcerptDraftStore()}
    />
  ),
};

/** No karaoke audio at all. Retrying cannot change it, so none is offered. */
export const NoKaraokeAudio: Story = {
  render: () => (
    <SongExcerptComposer
      read={async () => {
        throw new KaraokeAvailabilityError("unavailable", "no_karaoke");
      }}
      store={makeMemoryExcerptDraftStore()}
    />
  ),
};

/** About the viewer rather than the song, so it is kept separate from both. */
export const AgeRestricted: Story = {
  render: () => (
    <SongExcerptComposer
      read={async () => {
        throw new KaraokeApiError("age_locked", "Age verification is required.", 403, false);
      }}
      store={makeMemoryExcerptDraftStore()}
    />
  ),
};

/** The payload read succeeds and the audio still does not play: a ref that
 * does not fetch. The surface says so instead of waiting for a length. */
export const AudioWontPlay: Story = {
  render: () => (
    <SongExcerptComposer
      read={async () => ({
        instrumental_audio_url: "https://audio.invalid/missing.mp3",
        title: "A song whose audio moved",
      })}
      store={makeMemoryExcerptDraftStore()}
    />
  ),
};
