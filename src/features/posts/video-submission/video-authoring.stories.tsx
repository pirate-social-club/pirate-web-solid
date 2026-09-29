import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ApiClientError } from "@pirate/api-client";
import type { JSX } from "@solidjs/web";
import { createSignal, onCleanup, onSettled, Show } from "solid-js";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { Button, FormNote, Type } from "../../../design-system";
import { SongReviewPreview, type PreviewAudio } from "./song-review-preview";
import { VideoComposerRuntime, type GuideAudio, type VideoPostingOption } from "./video-composer-runtime";
import { VideoCaptureError, type OriginalVideoCaptureInput, type VideoCaptureSession } from "./capture";
import { SONG_VIDEO_PENDING, type PendingVideo, type VideoStorage } from "./coordinator";
import type { VideoCommand, VideoCommandResult, VideoTransport } from "./transport";
import { SongSourceError, type SongSourceReader } from "../post-composer/song-excerpt-source";
import type { SongPickerSource } from "../post-composer/song-picker";
import type { SongIntervalPreflight } from "./song-reference";
import type { VideoSnapshot } from "./contracts";
import { sampleVideoFile, toneWavUrl } from "./story-fixtures-media";

/** Authoring states for the song-backed video composer.
 *
 * Every story here is a simulated authoring session: the song is a generated
 * tone, the take is a canvas-encoded MP4, and the camera is a canvas stream.
 * No camera, microphone, encoder or provider is involved, so these stories
 * are for layout, language and playback inspection only. Real capture timing
 * and device synchronization are validated on a device, never here.
 *
 * The stories drive the same component the app ships; the only story-local
 * seam is the phone check, because Storybook runs on a desktop viewport and
 * the recording controls live on the camera channel.
 */

window.matchMedia = (query: string): MediaQueryList => ({
  matches: query.includes("pointer: coarse"),
  media: query,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
});

const SONG_MS = 214_000;

/** An empty live stream stands in for the camera preview: Storybook has no
 * guarantee of camera permission, and the settled story must be the state it
 * names rather than the not-supported fallback. */
function storyPreview(): () => Promise<MediaStream> {
  return async () => {
    if (typeof MediaStream !== "undefined") return new MediaStream();
    // SAFETY: The no-camera fixture needs only getTracks; it never enters an encoder.
    return Object.assign(Object.create(null) as MediaStream, { getTracks: () => [] });
  };
}

function toneReader(title = "Cadence (sample tone)"): SongSourceReader {
  const audioUrl = toneWavUrl(SONG_MS);
  return async request => ({
    postId: request.kind === "post" ? request.postId : "song-post",
    audioUrl,
    title,
  });
}

function readyPreflight(): SongIntervalPreflight {
  return async input => ({
    state: "ready" as const,
    song_post_id: input.body.song_post_id,
    audio_revision: 7,
    canonical_duration_samples: SONG_MS * 48,
    interval_policy: {
      policy_revision: 1,
      sample_rate_hz: 48_000 as const,
      min_clip_duration_samples: 3_000 * 48,
      max_clip_duration_samples: 180_000 * 48,
    },
    interval: input.body.interval ? { accepted: true as const } : null,
  });
}

function forbiddenPreflight(): SongIntervalPreflight {
  return async () => {
    throw new ApiClientError(
      { status: 400, code: "bad_request", name: "BadRequest", retryable: false },
      { error: {
        code: "bad_request",
        message: "This song's owner doesn't allow videos",
        retryable: false,
        details: { reason_code: "derivative_video_blocked", track: "video", capability: "song_reference" },
      } },
    );
  };
}

function measuringPreflight(): SongIntervalPreflight {
  return async input => ({
    state: "measuring" as const,
    song_post_id: input.body.song_post_id,
    audio_revision: 7,
    retry_after_ms: 2_000,
  });
}

function refusedPreflight(): SongIntervalPreflight {
  return async input => ({
    state: "ready" as const,
    song_post_id: input.body.song_post_id,
    audio_revision: 7,
    canonical_duration_samples: SONG_MS * 48,
    interval_policy: {
      policy_revision: 1,
      sample_rate_hz: 48_000 as const,
      min_clip_duration_samples: 3_000 * 48,
      max_clip_duration_samples: 180_000 * 48,
    },
    interval: input.body.interval ? { accepted: false as const, reason: "interval_too_long" as const } : null,
  });
}

interface StoryGuide extends GuideAudio {
  /** Freeze the guide's clock and report a playback gap, as a stalled stream does. */
  readonly stall: () => void;
}

let activeGuide: StoryGuide | undefined;

/** A guide with its own clock rather than an audio element. A real element is
 * refused by most browsers until the page has had a user gesture, which put
 * every recording story in the "would not play" state whenever it opened
 * unattended, whatever it was named for. This one starts when asked, so each
 * story shows the state it names; `blocked` makes it refuse the way a browser
 * does, for the one story about that refusal. The sound is not played: what
 * these stories show is the take's timing and its interruptions. */
function storyGuide(options: { readonly blocked?: boolean } = {}): StoryGuide {
  const listeners = new Map<string, Set<() => void>>();
  const emit = (type: string) => { for (const listener of listeners.get(type) ?? []) listener(); };
  let base = 0;
  let startedAt = 0;
  let playing = false;
  const now = () => (playing ? base + (performance.now() - startedAt) / 1_000 : base);
  const guide: StoryGuide = {
    get currentTime() { return now(); },
    set currentTime(value: number) { base = value; startedAt = performance.now(); },
    play: async () => {
      if (options.blocked) throw new DOMException("play() failed because the user didn't interact with the document first.", "NotAllowedError");
      if (!playing) { base = now(); startedAt = performance.now(); playing = true; }
      queueMicrotask(() => emit("playing"));
    },
    pause: () => { base = now(); playing = false; },
    addEventListener: (type, listener) => {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(listener); listeners.set(type, set);
    },
    removeEventListener: (type, listener) => { listeners.get(type)?.delete(listener); },
    stall: () => { base = now(); playing = false; emit("waiting"); },
  };
  activeGuide = guide;
  return guide;
}

/** A canvas stream as the viewfinder: a real moving picture, no camera. */
function canvasStream(): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 426;
  const context = canvas.getContext("2d")!;
  let frame = 0;
  const draw = () => {
    context.fillStyle = "#123047";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#7dd3fc";
    context.fillRect((frame % 24) * 10, 300, 30, 30);
    context.fillStyle = "#ffffff";
    context.font = "18px monospace";
    context.fillText(`simulated viewfinder ${frame}`, 12, 30);
    frame += 1;
    requestAnimationFrame(draw);
  };
  draw();
  return canvas.captureStream(12);
}

function captureDouble(options: {
  readonly fail?: "camera_denied" | "capability_unavailable";
  readonly autoStopAfterMs?: number;
  /** The encoder or a camera source fails this long after recording starts. */
  readonly encoderFailsAfterMs?: number;
} = {}) {
  return async (input: OriginalVideoCaptureInput): Promise<VideoCaptureSession> => {
    if (options.fail !== undefined) {
      throw new VideoCaptureError(options.fail, options.fail === "camera_denied"
        ? "Camera or microphone access is off."
        : "This browser can’t record video. Upload a video instead.");
    }
    const stream = canvasStream();
    if (options.autoStopAfterMs !== undefined) {
      setTimeout(() => { void input.onLimit(); }, options.autoStopAfterMs);
    }
    if (options.encoderFailsAfterMs !== undefined) {
      setTimeout(() => {
        input.onFailure(new VideoCaptureError("encoder_failed", "Recording failed. Try again or upload a video."));
      }, options.encoderFailsAfterMs);
    }
    return {
      stream,
      captureOriginMs: performance.now(),
      stop: async () => sampleVideoFile(12_000, 0),
      cancel: async () => { for (const track of stream.getTracks()) track.stop(); },
    };
  };
}

function memoryStorage(seed: PendingVideo | null = null): VideoStorage {
  let record = seed;
  return {
    exclusive: async work => work(),
    load: async () => record,
    save: async next => { record = next; },
    remove: async () => { record = null; },
  };
}

function uploadPlan(sizeBytes: number, parts = 1, expiresAt = "2099-01-01T00:00:00Z") {
  const partSize = Math.max(1, Math.ceil(sizeBytes / parts));
  return {
    method: "MULTIPART" as const,
    upload_id: "upload-story",
    part_count: parts,
    part_size_bytes: partSize,
    expires_at: expiresAt,
    parts: Array.from({ length: parts }, (_, index) => ({
      part_number: index + 1,
      url: `https://upload.story.test/${index + 1}`,
      expires_at: expiresAt,
    })),
  };
}

const snapshotBase = {
  track: "video" as const,
  intent: "song_reference" as const,
  submission_id: "submission-story",
  author_persona: { object: "persona" as const, persona_id: "persona", display_name: null, avatar_ref: null, primary_public_handle: null },
  creation_revision: 1,
  video_revision: 0,
  caption: "",
  updated_at: "2026-09-20T00:00:00Z",
  href: "/media-post-submissions/submission-story",
};

function storyTransport(options: {
  readonly finalize?: "published" | "retryable_failure";
  readonly slowParts?: boolean;
  /** Refuse the reservation as the server does: definitively, with or without
   * a named song reason. */
  readonly refuse?: { readonly songReason?: "derivative_video_blocked" };
} = {}): VideoTransport {
  return {
    async read(): Promise<VideoSnapshot> {
      return { ...snapshotBase, status: "processing", phase: "awaiting_upload" };
    },
    async execute(command: VideoCommand): Promise<VideoCommandResult> {
      if (command.kind === "reserve") {
        const body = command.input.body;
        if (body.track !== "video") throw new Error("not a video");
        if (options.refuse) {
          throw new ApiClientError(
            { status: 400, code: "bad_request", name: "BadRequest", retryable: false },
            { error: {
              code: "bad_request",
              message: "Request refused",
              retryable: false,
              ...(options.refuse.songReason === undefined ? {} : {
                details: { reason_code: options.refuse.songReason, track: "video", capability: "song_reference" },
              }),
            } },
          );
        }
        const upload = uploadPlan(body.expected_size_bytes, options.slowParts ? 3 : 1);
        if (body.intent === "original_audio") {
          return { track: "video", intent: "original_audio", status: "awaiting_upload", slot: "primary_video", author_persona_id: "persona", ingest_policy_revision: 1, reservation_id: "reservation-story", upload };
        }
        return {
          track: "video", intent: "song_reference", status: "awaiting_upload", slot: "primary_video",
          author_persona_id: "persona", ingest_policy_revision: 1, reservation_id: "reservation-story",
          song_reference: { song_post_id: body.song_post_id, audio_revision: body.audio_revision, song_asset_id: "song-asset" },
          reservation_policy_snapshot: { observed_at_transition: "media_reservation_issued", owner_policy_revision: 3, owner_policy_hash: "a".repeat(64), derivative_video: "allowed", observed_at: "2026-09-20T00:00:00Z" },
          interval: { clip_start_samples: body.clip_start_samples, clip_duration_samples: body.clip_duration_samples, song_duration_samples: SONG_MS * 48 },
          upload,
        };
      }
      if (command.kind === "finalize") {
        if (options.finalize === "retryable_failure") {
          throw new ApiClientError(
            { status: 503, code: "internal_error", name: "InternalError", retryable: true },
            { error: { code: "internal_error", message: "The render host is busy", retryable: true } },
          );
        }
        return { ...snapshotBase, status: "published", creation_revision: 2, video_revision: 1, published_resource: { post_id: "post-story", href: "/posts/post-story" } };
      }
      return { ...snapshotBase, status: "processing", phase: "awaiting_upload" };
    },
  };
}

function storyFetch(options: {
  readonly delayMs?: number;
  readonly fails?: boolean;
  /** Answer this many uploads, then leave the next one in flight for good. */
  readonly hangAfter?: number;
} = {}): typeof fetch {
  let calls = 0;
  const impl = async (): Promise<Response> => {
    calls += 1;
    if (options.fails) throw new TypeError("network down");
    if (options.hangAfter !== undefined && calls > options.hangAfter) return new Promise<Response>(() => undefined);
    if (options.delayMs !== undefined) await new Promise(resolve => setTimeout(resolve, options.delayMs));
    return new Response(null, { headers: { etag: "receipt-story" } });
  };
  // The upload path never uses fetch's static members; carry them over so the
  // double has the same shape.
  return Object.assign(impl, { preconnect: fetch.preconnect });
}

/** The story harness: the shipped runtime with story-local doubles and, where
 * a state needs an action, a control the reviewer can press. */
function Harness(props: {
  readonly reader?: SongSourceReader;
  readonly preflight?: SongIntervalPreflight;
  readonly startCapture?: (input: OriginalVideoCaptureInput) => Promise<VideoCaptureSession>;
  /** The live camera preview; a real getUserMedia in Storybook would fail
   * and settle the story on the not-supported state instead of the one it
   * names, so an empty stream stands in. */
  readonly openPreview?: () => Promise<MediaStream>;
  readonly measureDuration?: (file: File) => Promise<number | null>;
  readonly storage?: VideoStorage;
  readonly transport?: VideoTransport;
  readonly fetchImpl?: typeof fetch;
  readonly chooseFile?: () => Promise<File | null>;
  readonly autoContinue?: boolean;
  /** Open the composer with no song chosen, as from the composer's own entry. */
  readonly noInitialSong?: boolean;
  readonly songPicker?: SongPickerSource;
  readonly autoStart?: boolean;
  readonly autoPublish?: boolean;
  /** The guide song is refused by the browser, as it is before any gesture. */
  readonly guideBlocked?: boolean;
  /** The profiles that may author the video, and the community named on review. */
  readonly personaOptions?: readonly VideoPostingOption[];
  readonly communityName?: string;
  readonly controls?: JSX.Element;
}) {
  let container: HTMLDivElement | undefined;
  onSettled(() => {
    if (!props.chooseFile) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    void props.chooseFile().then(file => {
      if (file === null || cancelled) return;
      timer = setInterval(() => {
        const screen = container?.querySelector('[data-song-choice-screen][aria-hidden="true"]');
        const input = container?.querySelector<HTMLInputElement>('input[type="file"]');
        if (!screen || !input) return;
        clearInterval(timer);
        timer = undefined;
        const transfer = new DataTransfer();
        transfer.items.add(file);
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, 100);
    });
    return () => { cancelled = true; if (timer !== undefined) clearInterval(timer); };
  });
  onSettled(() => {
    if (!props.autoContinue && !props.autoStart && !props.autoPublish && !props.chooseFile) return;
    const timer = setInterval(() => {
      const plan = container?.querySelector('[data-song-plan="ready"]');
      const continueButton = [...(container?.querySelectorAll<HTMLButtonElement>('[data-song-choice-screen] button') ?? [])]
        .find(button => button.textContent?.trim() === "Continue to video" && !button.disabled);
      if (plan && continueButton && container?.querySelector('[data-song-choice-screen]')?.getAttribute("aria-hidden") !== "true") {
        continueButton.click();
      }
      if ((props.autoContinue || props.chooseFile) && !props.autoStart && !props.autoPublish) {
        if (container?.querySelector('[data-song-choice-screen]')?.getAttribute("aria-hidden") === "true") clearInterval(timer);
        return;
      }
      const start = [...(container?.querySelectorAll("button") ?? [])]
        .find(button => button.getAttribute("aria-label") === "Start recording");
      if (props.autoStart && plan && start) {
        clearInterval(timer);
        start.click();
        return;
      }
      if (props.autoPublish && plan && container?.querySelector("textarea") !== null) {
        const publish = [...(container?.querySelectorAll("button") ?? [])]
          .find(button => button.textContent?.trim() === "Publish video");
        if (publish) { clearInterval(timer); publish.click(); }
      }
    }, 100);
    // onSettled owns its cleanup through the returned function, not onCleanup.
    return () => clearInterval(timer);
  });
  return (
    <div ref={element => { container = element; }} class="mx-auto max-w-md">
      <VideoComposerRuntime
        communityId="community"
        createGuideAudio={() => storyGuide({ blocked: props.guideBlocked })}
        fetchImpl={props.fetchImpl ?? storyFetch()}
        initialSong={props.noInitialSong ? undefined : { postId: "song-post" }}
        inspectFile={async file => file}
        measureDuration={props.measureDuration}
        communityName={props.communityName}
        onExit={() => undefined}
        onPosted={() => undefined}
        onPublished={() => undefined}
        onRetainedPersona={() => undefined}
        personaId="persona"
        personaOptions={props.personaOptions}
        principalId="storybook-account"
        songPreflight={props.preflight ?? readyPreflight()}
        songPicker={props.songPicker}
        songReader={props.reader ?? toneReader()}
        openPreview={props.openPreview ?? storyPreview()}
        startCapture={props.startCapture ?? captureDouble()}
        storage={props.storage ?? memoryStorage()}
        transport={props.transport ?? storyTransport()}
      />
      {props.controls}
    </div>
  );
}

function retainedRecord(
  snapshot: VideoSnapshot,
  options: { readonly communityId?: string; readonly uploadExpiresAt?: string } = {},
): PendingVideo {
  // The upload plan describes this exact file: a resume refuses a plan that
  // does not match the bytes it holds.
  const file = new File(["take"], "take.mp4", { type: "video/mp4" });
  return {
    version: SONG_VIDEO_PENDING,
    principalId: "storybook-account",
    communityId: options.communityId ?? "community",
    personaId: "persona",
    file,
    caption: "",
    rating: "general",
    song: { songPostId: "song-post", audioRevision: 7, clipStartSamples: 0, clipDurationSamples: 15_000 * 48, selectedFrom: { kind: "library" } },
    reservation: {
      track: "video", intent: "song_reference", status: "awaiting_upload", slot: "primary_video",
      author_persona_id: "persona", ingest_policy_revision: 1, reservation_id: "reservation-story",
      song_reference: { song_post_id: "song-post", audio_revision: 7, song_asset_id: "song-asset" },
      reservation_policy_snapshot: { observed_at_transition: "media_reservation_issued", owner_policy_revision: 3, owner_policy_hash: "a".repeat(64), derivative_video: "allowed", observed_at: "2026-09-20T00:00:00Z" },
      interval: { clip_start_samples: 0, clip_duration_samples: 15_000 * 48, song_duration_samples: SONG_MS * 48 },
      upload: uploadPlan(file.size, 1, options.uploadExpiresAt),
    },
    snapshot,
    receipts: [],
    pending: null,
  };
}

function retainedTransport(snapshot: VideoSnapshot): VideoTransport {
  return {
    async read(): Promise<VideoSnapshot> { return snapshot; },
    async execute(): Promise<VideoCommandResult> { return snapshot; },
  };
}

/** A retained video that the server lets the author cancel. */
function cancellableTransport(snapshot: VideoSnapshot): VideoTransport {
  return {
    async read(): Promise<VideoSnapshot> { return snapshot; },
    async execute(command: VideoCommand): Promise<VideoCommandResult> {
      if (command.kind !== "cancel") return snapshot;
      return {
        ...snapshotBase,
        status: "abandoned",
        creation_revision: snapshot.creation_revision,
        video_revision: snapshot.video_revision,
        reason_code: "author_cancelled_before_finalize",
      };
    },
  };
}

const meta = {
  title: "Flows/Posts/VideoPost/Authoring",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The song-backed video composer in its authoring states. Every story is a simulated session: the song is a generated tone, the take is a canvas-encoded MP4, and the camera is a canvas stream. These stories are for layout, language and playback inspection; they are not evidence of real capture timing, permission behaviour or device synchronization. Only the actions valid for the state on screen are shown, in the words an author reads.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SongLoading: Story = {
  name: "Song loading",
  render: () => <Harness reader={async () => new Promise(() => {})} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The song is already chosen while it loads, so the sheet says so.
    await canvas.findByRole("dialog", { name: "Choose the starting point" });
    await canvas.findByText("Loading that song…");
    expect(canvas.getByRole("button", { name: "Continue to video" })).toBeDisabled();
    expect(canvas.queryByText("Choose a song to continue.")).toBeNull();
  },
};

export const SongUnavailable: Story = {
  name: "Song unavailable",
  render: () => <Harness reader={async () => { throw new SongSourceError("not_found", "Song not found", false); }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("dialog", { name: "Choose a song" });
    await canvas.findByText("That song isn’t available to play.");
    expect(canvas.getByRole("button", { name: "Continue to video" })).toBeDisabled();
    expect(canvas.queryByText("Choose a song to continue.")).toBeNull();
  },
};

export const NoSongChosen: Story = {
  name: "No song chosen yet",
  render: () => (
    <Harness
      noInitialSong
      songPicker={async () => ({
        songs: [{ postId: "cadence", title: "Cadence", artist: "salt-cove.pirate", artworkSrc: null }],
        nextCursor: null,
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("dialog", { name: "Choose a song" });
    await canvas.findByText("Choose a song to continue.");
    const control = canvas.getByRole("button", { name: "Continue to video" });
    expect(control).toBeDisabled();
    expect(control).toHaveAccessibleDescription("Choose a song to continue.");
  },
};

export const SongForbidden: Story = {
  name: "Song forbidden by its owner",
  render: () => <Harness preflight={forbiddenPreflight()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/owner doesn’t allow videos/);
    expect(canvas.getByRole("button", { name: "Continue to video" })).toBeDisabled();
  },
};

export const ExcerptSelection: Story = {
  name: "Excerpt selection",
  render: () => <Harness />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("dialog", { name: "Choose the starting point" });
    await waitFor(() => expect(canvas.getByRole("button", { name: "Continue to video" })).toBeEnabled(), { timeout: 10_000 });
    expect(canvas.queryByText("Choose a song to continue.")).toBeNull();
  },
};

export const PreflightPending: Story = {
  name: "Preflight still measuring",
  render: () => <Harness preflight={measuringPreflight()} />,
};

export const PreflightRefused: Story = {
  name: "Preflight refused",
  render: () => <Harness preflight={refusedPreflight()} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("alert");
    expect(canvas.getByRole("button", { name: "Continue to video" })).toBeDisabled();
  },
};

export const RecordingReady: Story = {
  name: "Ready to record with the song",
  render: () => <Harness autoContinue startCapture={captureDouble({ autoStopAfterMs: 60_000 })} />,
};

export const GuidedRecording: Story = {
  name: "Recording with the guide",
  render: () => <Harness autoStart startCapture={captureDouble({ autoStopAfterMs: 60_000 })} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/Recording to Cadence/, {}, { timeout: 20_000 });
    expect(canvas.queryByText(/would not play/)).toBeNull();
  },
};

/** The one story about a refused guide: a browser that has had no gesture
 * refuses to start the song, and the take does not begin. */
export const GuideBlocked: Story = {
  name: "Guide blocked by the browser",
  render: () => <Harness autoStart guideBlocked startCapture={captureDouble({ autoStopAfterMs: 60_000 })} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/The guide song would not play, so this recording did not start/, {}, { timeout: 20_000 });
    expect(canvas.queryByText(/Recording to Cadence/)).toBeNull();
  },
};

export const GuideInterrupted: Story = {
  name: "Guide interrupted mid-take",
  render: () => (
    <Harness
      autoStart
      startCapture={captureDouble({ autoStopAfterMs: 60_000 })}
      controls={<Button class="mt-3" onClick={() => activeGuide?.stall()} variant="secondary">Stall the guide</Button>}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/Recording to Cadence/, {}, { timeout: 20_000 });
    await userEvent.click(canvas.getByRole("button", { name: "Stall the guide" }));
    await canvas.findByText("That take ended", {}, { timeout: 20_000 });
    await canvas.findByRole("button", { name: "Record again" });
  },
};

export const Backgrounded: Story = {
  name: "Page hidden while recording",
  render: () => (
    <Harness
      autoStart
      startCapture={captureDouble({ autoStopAfterMs: 60_000 })}
      controls={<Button class="mt-3" onClick={() => {
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
        Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      }} variant="secondary">Simulate backgrounding</Button>}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/Recording to Cadence/, {}, { timeout: 20_000 });
    await userEvent.click(canvas.getByRole("button", { name: "Simulate backgrounding" }));
    await canvas.findByText("The page was hidden, so the guide song stopped and this recording ended.", {}, { timeout: 30_000 });
  },
};

export const ShortUploadedClip: Story = {
  name: "Uploaded clip shorter than the excerpt",
  render: () => <Harness chooseFile={() => sampleVideoFile(8_000)} measureDuration={async () => 9_000} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Review video", {}, { timeout: 20_000 });
    await canvas.findByRole("button", { name: "Publish video" });
  },
};

export const ExplainedTrimming: Story = {
  name: "Uploaded clip that will be trimmed",
  render: () => <Harness chooseFile={() => sampleVideoFile(16_000)} measureDuration={async () => 16_000} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/will be trimmed to the excerpt/, {}, { timeout: 20_000 });
  },
};

export const ReviewPlayback: Story = {
  name: "Review with the intended soundtrack",
  render: () => <Harness chooseFile={() => sampleVideoFile(12_000)} measureDuration={async () => 12_000} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Review video", {}, { timeout: 20_000 });
    await canvas.findByRole("button", { name: "Publish video" });
    expect(canvas.queryByText(/choose a shorter one/)).toBeNull();
  },
};

/** The preview surface with a real sample video; the stall and error seams
 * are the same ones the tests use. */
function PreviewStage(props: { readonly mode: "stall" | "error" }) {
  const [videoUrl, setVideoUrl] = createSignal<string>();
  let container: HTMLDivElement | undefined;
  onSettled(() => {
    void sampleVideoFile(32_000).then(file => setVideoUrl(URL.createObjectURL(file)));
  });
  onCleanup(() => {
    const url = videoUrl();
    if (url) URL.revokeObjectURL(url);
  });
  // A clock rather than a frozen value: the preview follows the song, and a
  // frozen song makes it seek the video every frame.
  let base = 31_000;
  let paused = true;
  let startedAt = 0;
  const audio: PreviewAudio = {
    get currentTime() { return (paused ? base : base + (performance.now() - startedAt)) / 1_000; },
    set currentTime(value: number) { base = value * 1_000; startedAt = performance.now(); },
    play: async () => {
      if (props.mode === "error") throw new Error("playback blocked");
      paused = false;
      startedAt = performance.now();
    },
    pause: () => {
      if (!paused) base += performance.now() - startedAt;
      paused = true;
    },
  };
  return (
    <div ref={element => { container = element; }} class="mx-auto grid max-w-md gap-3 p-4">
      <SongReviewPreview
        audioUrl={toneWavUrl(SONG_MS)}
        bounds={{ startMs: 31_000, endMs: 61_000 }}
        createAudio={() => audio}
        videoUrl={videoUrl()}
      />
      <Show when={props.mode === "stall"}>
        <Button onClick={() => {
          const video = container?.querySelector("video");
          if (!video) return;
          video.dispatchEvent(new Event("waiting", { bubbles: true }));
          // Hold the video where it stalled, so the state stays on screen for
          // inspection instead of clearing on the next buffered frame.
          video.pause();
        }} variant="secondary">
          Stall the video
        </Button>
      </Show>
    </div>
  );
}

export const ReviewStall: Story = {
  name: "Review preview stall",
  render: () => <PreviewStage mode="stall" />,
};

export const ReviewError: Story = {
  name: "Review preview cannot start",
  render: () => <PreviewStage mode="error" />,
};

export const UploadProgress: Story = {
  name: "Upload progress",
  render: () => (
    <Harness
      autoPublish
      chooseFile={() => sampleVideoFile(12_000)}
      fetchImpl={storyFetch({ hangAfter: 2 })}
      measureDuration={async () => 12_000}
      transport={storyTransport({ slowParts: true })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Two of three parts are sent and the third stays in flight, so the
    // story holds at partial progress instead of finishing and leaving.
    await canvas.findByText("Uploading video… 66%", {}, { timeout: 20_000 });
  },
};

export const UploadFailure: Story = {
  name: "Upload finished but not confirmed",
  render: () => (
    <Harness
      autoPublish
      chooseFile={() => sampleVideoFile(12_000)}
      measureDuration={async () => 12_000}
      transport={storyTransport({ finalize: "retryable_failure" })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/couldn't confirm it arrived yet/, {}, { timeout: 20_000 });
  },
};

/** A video the author already submitted for publication, kept because its
 * upload was still owed when the composer closed. Reopening picks it up where it
 * stopped, without a control to press. */
export const SubmittedUploadResumes: Story = {
  name: "Submitted upload resumes by itself",
  render: () => {
    const snapshot: VideoSnapshot = { ...snapshotBase, status: "processing", phase: "awaiting_upload" };
    return (
      <Harness
        fetchImpl={storyFetch({ delayMs: 120_000 })}
        storage={memoryStorage(retainedRecord(snapshot))}
        transport={retainedTransport(snapshot)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(/Uploading video/, {}, { timeout: 20_000 });
    // Nothing here is a control the author has to press to keep it going.
    expect(canvas.queryByRole("button", { name: /Resume video submission|Pause upload|Check video status|Cancel video submission/ })).toBeNull();
  },
};

export const SubmittedUploadNeedsAnotherTry: Story = {
  name: "Submitted upload needs another try",
  render: () => {
    const snapshot: VideoSnapshot = { ...snapshotBase, status: "processing", phase: "awaiting_upload" };
    return (
      <Harness
        fetchImpl={storyFetch({ fails: true })}
        storage={memoryStorage(retainedRecord(snapshot))}
        transport={retainedTransport(snapshot)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Your video hasn't finished uploading.", {}, { timeout: 20_000 });
    // What happened, in words the author can act on: not the browser's error.
    await canvas.findByText("We couldn’t reach the upload server. Check your connection and try again.");
    expect(canvas.queryByText(/network down|Failed to fetch/)).toBeNull();
    await canvas.findByRole("button", { name: "Try again" });
    await canvas.findByRole("button", { name: "Cancel upload" });
    expect(canvas.queryByRole("button", { name: /Resume video submission|Pause upload|Check video status/ })).toBeNull();
  },
};

/** The reservation's window closed while the composer was away. It cannot be
 * resumed, only cancelled. */
export const SubmittedUploadExpired: Story = {
  name: "Submitted upload expired",
  render: () => {
    const snapshot: VideoSnapshot = { ...snapshotBase, status: "processing", phase: "awaiting_upload" };
    return (
      <Harness
        storage={memoryStorage(retainedRecord(snapshot, { uploadExpiresAt: "2026-01-01T00:00:00Z" }))}
        transport={retainedTransport(snapshot)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("This upload expired. Cancel it, then choose the video again.", {}, { timeout: 20_000 });
    await canvas.findByRole("button", { name: "Cancel upload" });
    expect(canvas.queryByRole("button", { name: "Try again" })).toBeNull();
    // The coordinator's own sentence for the same fact is not shown beside it.
    expect(canvas.queryByText(/reservation|resolve it before starting a new attempt/i)).toBeNull();
  },
};

/** Cancelling a submitted upload ends it: the video is cancelled and the only
 * way on is a new one. */
export const SubmittedUploadCancelled: Story = {
  name: "Submitted upload cancelled",
  render: () => {
    const snapshot: VideoSnapshot = { ...snapshotBase, status: "processing", phase: "awaiting_upload" };
    return (
      <Harness
        fetchImpl={storyFetch({ fails: true })}
        storage={memoryStorage(retainedRecord(snapshot))}
        transport={cancellableTransport(snapshot)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The upload resumes by itself and fails; act only once that has settled,
    // or the click lands on a control that is about to be replaced.
    await canvas.findByText("We couldn’t reach the upload server. Check your connection and try again.", {}, { timeout: 20_000 });
    await userEvent.click(canvas.getByRole("button", { name: "Cancel upload" }));
    await canvas.findByText("This video was cancelled.", {}, { timeout: 20_000 });
    await canvas.findByRole("button", { name: "Start a new video" });
    expect(canvas.queryByRole("button", { name: /Try again|Cancel upload|Check video status/ })).toBeNull();
  },
};

/** A submitted upload belongs to the community it was started in. Opened from
 * another one it waits, and says where to finish it. */
export const SubmittedUploadInAnotherCommunity: Story = {
  name: "Submitted upload belongs to another community",
  render: () => {
    const snapshot: VideoSnapshot = { ...snapshotBase, status: "processing", phase: "awaiting_upload" };
    return (
      <Harness
        storage={memoryStorage(retainedRecord(snapshot, { communityId: "another-community" }))}
        transport={retainedTransport(snapshot)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Your video hasn't finished uploading.", {}, { timeout: 20_000 });
    await userEvent.click(await canvas.findByRole("button", { name: "Try again" }));
    await canvas.findByText("Your earlier video is still uploading for another community. Open that community to finish it.", {}, { timeout: 20_000 });
  },
};

/** The server refused the video outright. Nothing was uploaded, and the author
 * can edit it and try again. */
export const VideoNotAccepted: Story = {
  name: "Video not accepted",
  render: () => (
    <Harness
      autoPublish
      chooseFile={() => sampleVideoFile(12_000)}
      measureDuration={async () => 12_000}
      transport={storyTransport({ refuse: {} })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("This video wasn’t accepted.", {}, { timeout: 30_000 });
    await canvas.findByRole("button", { name: "Edit rejected video" });
    // The server's own message for the refusal is not shown beside the plain sentence.
    expect(canvas.queryByText("Request refused")).toBeNull();
  },
};

/** The refusal names the song: its owner stopped allowing videos after the
 * excerpt was accepted. The message says to choose another song. */
export const VideoNotAcceptedBySong: Story = {
  name: "Video not accepted because of the song",
  render: () => (
    <Harness
      autoPublish
      chooseFile={() => sampleVideoFile(12_000)}
      measureDuration={async () => 12_000}
      transport={storyTransport({ refuse: { songReason: "derivative_video_blocked" } })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const alert = await canvas.findByRole("alert", {}, { timeout: 30_000 });
    expect(alert).toHaveTextContent(/Choose another song\./);
    await canvas.findByRole("button", { name: "Edit rejected video" });
    expect(canvas.queryByText("Request refused")).toBeNull();
  },
};

const PROFILES: readonly VideoPostingOption[] = [
  { id: "persona", label: "Harbour Lights" },
  { id: "persona-night-shift", label: "Night Shift" },
];

/** Two profiles may author here: review names the community and lets the
 * author choose which one posts. */
export const ReviewPostingAs: Story = {
  name: "Review with a choice of profile",
  render: () => (
    <Harness
      chooseFile={() => sampleVideoFile(12_000)}
      communityName="Pirate Harbor"
      measureDuration={async () => 12_000}
      personaOptions={PROFILES}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Posting in Pirate Harbor", {}, { timeout: 30_000 });
    await canvas.findByText("Posting as");
  },
};

/** None of the author's profiles can post in this community, so capture is
 * closed and says why. */
export const NoPostingProfile: Story = {
  name: "No profile can post in this community",
  render: () => (
    <Harness
      autoContinue
      personaOptions={[{ id: "persona-elsewhere", label: "Elsewhere", communityId: "another-community" }]}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Choose a posting profile for this community.", {}, { timeout: 30_000 });
  },
};

export const RecordingStopped: Story = {
  name: "Recording failed after it started",
  render: () => <Harness autoStart startCapture={captureDouble({ encoderFailsAfterMs: 600 })} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Recording stopped" }, { timeout: 20_000 });
    await canvas.findByRole("button", { name: "Try again" });
    // A failed recording is not an unsupported browser.
    expect(canvas.queryByText("Recording isn’t available here")).toBeNull();
  },
};

export const RecordingUnavailable: Story = {
  name: "Browser cannot record",
  render: () => <Harness autoStart startCapture={captureDouble({ fail: "capability_unavailable" })} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Recording isn’t available here" }, { timeout: 20_000 });
    await canvas.findByRole("button", { name: "Upload a video" });
    expect(canvas.queryByRole("button", { name: "Try again" })).toBeNull();
  },
};

export const AuthoringNote: Story = {
  name: "What these stories are not",
  render: () => (
    <div class="mx-auto max-w-md p-4">
      <Type as="h2" variant="h4">Simulated authoring, not device evidence</Type>
      <FormNote tone="muted">
        Every state above is produced with generated media and injected providers. Real camera and
        microphone permission, encoder behaviour, background audio and the alignment between what an
        author hears and what the camera records are validated on a device, not in Storybook.
      </FormNote>
    </div>
  ),
};
