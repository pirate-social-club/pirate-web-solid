/** @jsxImportSource @solidjs/web */
import "../../src/index.css";
import { render } from "@solidjs/web";
import { createRoot, createSignal, Show } from "solid-js";
import { VideoComposerRuntime, type GuideAudio } from "../../src/features/posts/video-submission/video-composer-runtime";
import { SongVideoEntry, initialVideoSongFromSearch } from "../../src/features/posts/public-post/song-video-entry";
import { SongAttributionChip } from "../../src/features/posts/song-attribution/song-attribution-chip";
import type { OriginalVideoCaptureInput, VideoCaptureSession } from "../../src/features/posts/video-submission/capture";
import type { SongSourceReader } from "../../src/features/posts/post-composer/song-excerpt-source";
import type { SongIntervalPreflight } from "../../src/features/posts/video-submission/song-reference";
import type { VideoCommand, VideoCommandResult, VideoTransport } from "../../src/features/posts/video-submission/transport";
import type { VideoSnapshot } from "../../src/features/posts/video-submission/contracts";

/** Local fixture only. No production route, credential or provider request.
 *
 * The song-first composer is mounted with provider doubles: the song read, the
 * preflight, the capture entry point and the clip measurement are injected.
 * The guide is a real audio element, so the browser proof exercises actual
 * playback timing, while the capture itself is still a double: real camera,
 * encoder and device synchronization remain explicit open items.
 *
 * The page is two surfaces. Without a query it is the song post, whose
 * "Use this song" link carries the song into the community composer; with
 * `?compose=video&song=...` it is the composer that link opens, parsed by the
 * same helper the route uses.
 */

// Provider double: the composer's phone check is a media query, and this
// fixture needs the camera channel without a phone.
window.matchMedia = ((query: string) => ({
  matches: query.includes("pointer: coarse"),
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const key = "song-video-browser-proof";
interface Ledger {
  calls: string[];
  limitMs: number | null;
  guidePlayed: number;
  guidePaused: number;
  guideStart: number | null;
  guideDelayMs: number | null;
  stopped: number;
  guideFails: boolean;
  slowGuide: boolean;
  reserveBody: Record<string, unknown> | null;
}
function ledger(): Ledger {
  return JSON.parse(localStorage.getItem(key) ?? "null") ?? {
    calls: [], limitMs: null, guidePlayed: 0, guidePaused: 0, guideStart: null, guideDelayMs: null,
    stopped: 0, guideFails: false, slowGuide: false, reserveBody: null,
  };
}
function write(next: Ledger): void {
  localStorage.setItem(key, JSON.stringify(next));
}
let notify = (): void => {};
function record(call: string): void {
  const state = ledger(); state.calls.push(call); write(state); notify();
}

function toneWavUrl(durationMs: number): string {
  const rate = 8_000;
  const samples = Math.floor((durationMs / 1_000) * rate);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  ascii(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); ascii(8, "WAVE"); ascii(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, "data"); view.setUint32(40, samples * 2, true);
  let phase = 0;
  for (let index = 0; index < samples; index += 1) {
    phase += (2 * Math.PI * 330) / rate;
    view.setInt16(44 + index * 2, Math.round(Math.sin(phase) * 0.25 * 32_767), true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

const SONG_MS = 4_000;
const audioUrl = toneWavUrl(SONG_MS);

const songReader: SongSourceReader = async () => ({
  postId: "song-fixture",
  audioUrl,
  title: "Fixture song",
});

const preflight: SongIntervalPreflight = async (input) => {
  record(`preflight:${input.body.interval ? "interval" : "timing"}`);
  return {
    state: "ready" as const,
    song_post_id: input.body.song_post_id,
    audio_revision: 7,
    canonical_duration_samples: SONG_MS * 48,
    interval_policy: {
      policy_revision: 1,
      sample_rate_hz: 48_000 as const,
      min_clip_duration_samples: 3_000 * 48,
      max_clip_duration_samples: SONG_MS * 48,
    },
    interval: input.body.interval ? { accepted: true as const } : null,
  };
};

/** The chosen file's name decides the simulated measurement; "take.mp4" comes
 * from the fixture capture and is left unmeasured, as a real take is until the
 * server probe. */
async function measureDuration(file: File): Promise<number | null> {
  if (file.name === "short.mp4") return 3_000;
  if (file.name === "long.mp4") return 45_000;
  return null;
}

interface FixtureGuide extends GuideAudio {
  readonly emit: (type: "waiting" | "stalled" | "error") => void;
}
let currentGuide: FixtureGuide | undefined;

/** A real audio element behind the guide interface: actual media, actual
 * playback timing, and a seam for the interruption cases. */
function createGuide(url: string): FixtureGuide {
  const element = new Audio(url);
  const listeners = new Map<string, Set<() => void>>();
  const emit = (type: string) => { for (const listener of listeners.get(type) ?? []) listener(); };
  element.addEventListener("waiting", () => emit("waiting"));
  element.addEventListener("stalled", () => emit("stalled"));
  element.addEventListener("playing", () => emit("playing"));
  element.addEventListener("error", () => emit("error"));
  const guide: FixtureGuide = {
    get currentTime() { return element.currentTime; },
    set currentTime(value: number) { element.currentTime = value; },
    play: async () => {
      const state = ledger();
      state.guidePlayed += 1;
      state.guideStart = element.currentTime;
      write(state);
      notify();
      if (state.guideFails) {
        state.guideFails = false; write(state);
        throw new Error("guide denied");
      }
      if (state.slowGuide) {
        state.slowGuide = false; write(state);
        await new Promise(resolve => setTimeout(resolve, 900));
      }
      await element.play();
    },
    pause: () => {
      const state = ledger();
      state.guidePaused += 1;
      write(state);
      notify();
      element.pause();
    },
    addEventListener: (type, listener) => {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(listener); listeners.set(type, set);
    },
    removeEventListener: (type, listener) => { listeners.get(type)?.delete(listener); },
    emit: type => emit(type),
  };
  currentGuide = guide;
  return guide;
}

const snapshotBase = {
  track: "video" as const, intent: "song_reference" as const, submission_id: "submission-fixture",
  author_persona: { object: "persona" as const, persona_id: "persona-fixture", display_name: null, avatar_ref: null, primary_public_handle: null },
  creation_revision: 1, video_revision: 0, caption: "", updated_at: "2026-09-20T00:00:00Z", href: "/media-post-submissions/submission-fixture",
};
const upload = { method: "MULTIPART" as const, upload_id: "upload-fixture", part_count: 1, part_size_bytes: 10, expires_at: "2099-01-01T00:00:00Z", parts: [{ part_number: 1, url: "https://upload.fixture.test/1", expires_at: "2099-01-01T00:00:00Z" }] };

let finalized = false;
const transport: VideoTransport = {
  async read(): Promise<VideoSnapshot> {
    return finalized
      ? { ...snapshotBase, status: "published", creation_revision: 2, video_revision: 1, published_resource: { post_id: "published-fixture", href: "/posts/published-fixture" } }
      : { ...snapshotBase, status: "processing", phase: "awaiting_upload" };
  },
  async execute(command: VideoCommand): Promise<VideoCommandResult> {
    record(`command:${command.kind}`);
    if (command.kind === "reserve") {
      const body = command.input.body;
      if (body.track !== "video") throw new Error("not a video");
      const state = ledger();
      state.reserveBody = body as unknown as Record<string, unknown>;
      write(state);
      notify();
      if (body.intent === "original_audio") {
        return { track: "video", intent: "original_audio", status: "awaiting_upload", slot: "primary_video", author_persona_id: "persona-fixture", ingest_policy_revision: 1, reservation_id: "reservation-fixture", upload };
      }
      return {
        track: "video", intent: "song_reference", status: "awaiting_upload", slot: "primary_video",
        author_persona_id: "persona-fixture", ingest_policy_revision: 1, reservation_id: "reservation-fixture",
        song_reference: { song_post_id: body.song_post_id, audio_revision: body.audio_revision, song_asset_id: "song-asset" },
        reservation_policy_snapshot: { observed_at_transition: "media_reservation_issued", owner_policy_revision: 3, owner_policy_hash: "a".repeat(64), derivative_video: "allowed", observed_at: "2026-09-20T00:00:00Z" },
        interval: { clip_start_samples: body.clip_start_samples, clip_duration_samples: body.clip_duration_samples, song_duration_samples: SONG_MS * 48 },
        upload,
      };
    }
    if (command.kind === "finalize") {
      finalized = true;
      return { ...snapshotBase, status: "published", creation_revision: 2, video_revision: 1, published_resource: { post_id: "published-fixture", href: "/posts/published-fixture" } };
    }
    return { ...snapshotBase, status: "processing", phase: "awaiting_upload" };
  },
};

const search = Object.fromEntries(new URLSearchParams(location.search).entries());
const initialSong = initialVideoSongFromSearch(search);

createRoot(() => {
  const [version, setVersion] = createSignal(0);
  notify = () => setVersion(value => value + 1);
  const startCapture = async (input: OriginalVideoCaptureInput): Promise<VideoCaptureSession> => {
    const state = ledger();
    state.limitMs = input.limitMs ?? null;
    write(state);
    record(`capture:limit=${input.limitMs ?? "none"}`);
    // The fake capture honors the requested duration rather than a constant,
    // so the proof measures the stop request, not just callback wiring.
    setTimeout(() => { void input.onLimit(); }, input.limitMs ?? 900);
    return {
      stream: new MediaStream(),
      stop: async () => { const current = ledger(); current.stopped += 1; write(current); record("capture:stopped"); return new File(["take"], "take.mp4", { type: "video/mp4" }); },
      cancel: async () => { record("capture:cancelled"); },
    };
  };
  render(() => (
    <main>
      <h1>Local song-first video proof</h1>
      <Show
        when={initialSong}
        fallback={
          <section aria-label="Song post fixture">
            <h2>Fixture song post</h2>
            <SongVideoEntry communityId="community-fixture" postId="song-fixture" read={async () => true} sessionHint={() => true} />
          </section>
        }
      >
        {(song) => (
          <>
            <VideoComposerRuntime
              communityId="community-fixture"
              createGuideAudio={url => createGuide(url)}
              fetchImpl={async () => new Response(null, { headers: { etag: "receipt" } })}
              initialSong={song()}
              inspectFile={async file => file}
              measureDuration={measureDuration}
              onExit={() => undefined}
              onGuideTiming={timing => {
                const state = ledger(); state.guideDelayMs = timing.startDelayMs; write(state); notify();
              }}
              onPublished={() => undefined}
              onRetainedPersona={() => undefined}
              personaId="persona-fixture"
              principalId="account-fixture"
              songPreflight={preflight}
              songReader={songReader}
              startCapture={startCapture}
              transport={transport}
            />
            <section aria-label="Attribution fixture">
              <SongAttributionChip
                attribution={{ songPostId: "song-fixture", title: "Fixture song" }}
                resolveLink={async () => ({ href: "/posts/fixture-song", title: "Fixture song", authorName: "Fixture author" })}
              />
            </section>
          </>
        )}
      </Show>
      <button onClick={() => { const state = ledger(); state.guideFails = true; write(state); notify(); }}>Fail the next guide</button>
      <button onClick={() => { const state = ledger(); state.slowGuide = true; write(state); notify(); }}>Slow the next guide</button>
      <button onClick={() => currentGuide?.emit("waiting")}>Stall the guide now</button>
      <pre data-proof-result>{JSON.stringify({ ...ledger(), version: version() })}</pre>
    </main>
  ), document.getElementById("app")!);
});
