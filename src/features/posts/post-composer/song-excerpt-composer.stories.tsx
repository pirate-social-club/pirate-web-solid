import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { SongExcerptComposer } from "./song-excerpt-composer";
import type { SongPickerItem, SongPickerSource } from "./song-picker";
import type { SongIntervalPreflight } from "../video-submission/song-reference";
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
  // The picked song keeps its own name; the audio is the same stand-in tone.
  return async request => ({
    postId: request.kind === "post" ? request.postId : "resolved-from-slug",
    audioUrl,
    title: standInSongList.find(song => request.kind === "post" && song.postId === request.postId)?.title ?? title,
  });
}

const meta = {
  title: "Flows/Posts/VideoPost/SongChoice",
  globals: { viewport: { value: "mobile1", isRotated: false } },
  decorators: [Story => <div class="p-4"><Story /></div>],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Choosing the video's song: pick one of the community's songs, or paste a song post link, hear the fixed window of its full mix, and keep it with the video automatically. The audio is the song playback access grant, the same read the song player uses. The composer never substitutes a fixture: loading, unavailable and error are shown as themselves. In these stories the song list and the read are stood in for, because Storybook has no session and no reachable audio host; the post ids and the tone are not real, and the story that fails is failing deliberately. Permission to render the audio into a published video is the server's decision, asked through the preflight and never inferred here.",

      },
    },
  },
} satisfies Meta;

/** Songs posted in the community, as the picker lists them. Stand-ins: the
 * ids and names are not real posts. */
const standInSongList: readonly SongPickerItem[] = [
  { postId: "cadence-post", title: "Cadence", artist: "salt-cove.pirate", artworkSrc: null },
  { postId: "low-tide-post", title: "Low Tide", artist: "drift-reef.pirate", artworkSrc: null },
  { postId: "harbor-lights-post", title: "Harbor Lights", artist: "night-owl.pirate", artworkSrc: null },
];
const standInSongs: SongPickerSource = async () => standInSongList;

/** Accepts every excerpt, standing in for the server's rights check. */
const standInPreflight: SongIntervalPreflight = async input => ({
  state: "ready", song_post_id: input.body.song_post_id, audio_revision: 1, canonical_duration_samples: 7_200_000,
  interval_policy: { policy_revision: 1, sample_rate_hz: 48_000, min_clip_duration_samples: 144_000, max_clip_duration_samples: 8_640_000 },
  interval: input.body.interval === undefined ? null : { accepted: true },
});

export default meta;
type Story = StoryObj<typeof meta>;

/** The starting point: the community's songs, searchable, with a pasted
 * link accepted in the same field. */
export const ChooseHearAndRetain: Story = {
  render: () => (
    <SongExcerptComposer
      communityId="community-story"
      onClose={() => {}}
      songs={standInSongs}
      read={standInReader("Cadence", 150_000)}
      preflight={standInPreflight}
      store={memoryStore()}
    />
  ),
};

/** A song picked from the list: its window plays and the excerpt controls
 * take the picker's place. */
export const SongPicked: Story = {
  render: () => (
    <SongExcerptComposer
      communityId="community-story"
      initialSong={{ postId: "cadence-post" }}
      songs={standInSongs}
      read={standInReader("Cadence", 150_000)}
      preflight={standInPreflight}
      store={memoryStore()}
    />
  ),
};

/** The community's songs are still loading. */
export const SongsLoading: Story = {
  render: () => (
    <SongExcerptComposer
      communityId="community-story"
      songs={() => new Promise(() => {})}
      read={standInReader("Cadence", 150_000)}
      store={memoryStore()}
    />
  ),
};

/** The song list failed to load. Pasting a link still works. */
export const SongsFailed: Story = {
  render: () => (
    <SongExcerptComposer
      communityId="community-story"
      songs={async () => { throw new Error("unavailable"); }}
      read={standInReader("Cadence", 150_000)}
      store={memoryStore()}
    />
  ),
};

/** A community with no songs yet. */
export const NoSongsYet: Story = {
  render: () => (
    <SongExcerptComposer
      communityId="community-story"
      songs={async () => []}
      read={standInReader("Cadence", 150_000)}
      store={memoryStore()}
    />
  ),
};

/** A song barely longer than the minimum excerpt, where the controls have
 * almost no room to move. */
export const ShortSong: Story = {
  render: () => (
    <SongExcerptComposer
      communityId="community-story"
      initialSong={{ postId: "cadence-post" }}
      songs={standInSongs}
      read={standInReader("Interlude", 8_200)}
      store={memoryStore()}
    />
  ),
};

/** The read never settles, so the loading state stays on screen. */
export const Loading: Story = {
  render: () => (
    <SongExcerptComposer
      communityId="community-story"
      initialSong={{ postId: "cadence-post" }}
      songs={standInSongs} read={() => new Promise(() => {})} store={memoryStore()} />
  ),
};

/** A real song whose audio is still being prepared. Not an error, and not
 * something to quietly play a fixture for. */
export const NoAudioYet: Story = {
  render: () => (
    <SongExcerptComposer
      communityId="community-story"
      initialSong={{ postId: "cadence-post" }}
      songs={standInSongs}
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
      communityId="community-story"
      initialSong={{ postId: "cadence-post" }}
      songs={standInSongs}
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
      communityId="community-story"
      initialSong={{ postId: "cadence-post" }}
      songs={standInSongs}
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
      communityId="community-story"
      initialSong={{ postId: "cadence-post" }}
      songs={standInSongs}
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
      communityId="community-story"
      initialSong={{ postId: "cadence-post" }}
      songs={standInSongs}
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
      communityId="community-story"
      initialSong={{ postId: "cadence-post" }}
      songs={standInSongs}
      read={async request => ({
        postId: request.kind === "post" ? request.postId : "slug",
        audioUrl: "https://audio.invalid/missing.mp3",
        title: "A song whose audio moved",
      })}
      store={memoryStore()}
    />
  ),
};
