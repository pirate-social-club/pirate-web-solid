import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ApiClientError } from "@pirate/api-client";
import type { JSX } from "@solidjs/web";
import { createSignal, onCleanup, onSettled, Show } from "solid-js";

import { Button, FormNote, Type } from "../../../design-system";
import { SongReviewPreview, type PreviewAudio } from "./song-review-preview";
import { VideoComposerRuntime, type GuideAudio } from "./video-composer-runtime";
import { VideoCaptureError, type OriginalVideoCaptureInput, type VideoCaptureSession } from "./capture";
import { SONG_VIDEO_PENDING, type PendingVideo, type VideoStorage } from "./coordinator";
import type { VideoCommand, VideoCommandResult, VideoTransport } from "./transport";
import { SongSourceError, type SongSourceReader } from "../post-composer/song-excerpt-source";
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
  readonly emit: (type: "waiting" | "stalled" | "error") => void;
}

let activeGuide: StoryGuide | undefined;

/** A real audio element behind the guide interface, with a seam for the
 * interruption states a story needs to show on demand. */
function storyGuide(): StoryGuide {
  const element = new Audio(toneWavUrl(SONG_MS));
  const listeners = new Map<string, Set<() => void>>();
  const emit = (type: string) => { for (const listener of listeners.get(type) ?? []) listener(); };
  element.addEventListener("waiting", () => emit("waiting"));
  element.addEventListener("stalled", () => emit("stalled"));
  element.addEventListener("playing", () => emit("playing"));
  const guide: StoryGuide = {
    get currentTime() { return element.currentTime; },
    set currentTime(value: number) { element.currentTime = value; },
    play: () => element.play(),
    pause: () => element.pause(),
    addEventListener: (type, listener) => {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(listener); listeners.set(type, set);
    },
    removeEventListener: (type, listener) => { listeners.get(type)?.delete(listener); },
    emit,
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
} = {}) {
  return async (input: OriginalVideoCaptureInput): Promise<VideoCaptureSession> => {
    if (options.fail !== undefined) {
      throw new VideoCaptureError(options.fail, options.fail === "camera_denied"
        ? "Camera or microphone access is unavailable; upload remains available"
        : "This browser cannot record H.264 and AAC; choose a compatible video instead");
    }
    const stream = canvasStream();
    if (options.autoStopAfterMs !== undefined) {
      setTimeout(() => { void input.onLimit(); }, options.autoStopAfterMs);
    }
    return {
      stream,
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

function uploadPlan(sizeBytes: number, parts = 1) {
  const partSize = Math.max(1, Math.ceil(sizeBytes / parts));
  return {
    method: "MULTIPART" as const,
    upload_id: "upload-story",
    part_count: parts,
    part_size_bytes: partSize,
    expires_at: "2099-01-01T00:00:00Z",
    parts: Array.from({ length: parts }, (_, index) => ({
      part_number: index + 1,
      url: `https://upload.story.test/${index + 1}`,
      expires_at: "2099-01-01T00:00:00Z",
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
} = {}): VideoTransport {
  return {
    async read(): Promise<VideoSnapshot> {
      return { ...snapshotBase, status: "processing", phase: "awaiting_upload" };
    },
    async execute(command: VideoCommand): Promise<VideoCommandResult> {
      if (command.kind === "reserve") {
        const body = command.input.body;
        if (body.track !== "video") throw new Error("not a video");
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

function storyFetch(options: { readonly delayMs?: number } = {}): typeof fetch {
  const impl = async () => {
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
  readonly measureDuration?: (file: File) => Promise<number | null>;
  readonly storage?: VideoStorage;
  readonly transport?: VideoTransport;
  readonly fetchImpl?: typeof fetch;
  readonly chooseFile?: () => Promise<File | null>;
  readonly autoStart?: boolean;
  readonly autoPublish?: boolean;
  readonly controls?: JSX.Element;
}) {
  let container: HTMLDivElement | undefined;
  onSettled(() => {
    if (!props.chooseFile) return;
    void props.chooseFile().then(file => {
      if (file === null) return;
      const input = container?.querySelector<HTMLInputElement>('input[type="file"]');
      if (!input) return;
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
  onSettled(() => {
    if (!props.autoStart && !props.autoPublish) return;
    const timer = setInterval(() => {
      const plan = container?.querySelector('[data-song-plan="ready"]');
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
        createGuideAudio={() => storyGuide()}
        fetchImpl={props.fetchImpl ?? storyFetch()}
        initialSong={{ postId: "song-post" }}
        inspectFile={async file => file}
        measureDuration={props.measureDuration}
        onExit={() => undefined}
        onPublished={() => undefined}
        onRetainedPersona={() => undefined}
        personaId="persona"
        principalId="storybook-account"
        songPreflight={props.preflight ?? readyPreflight()}
        songReader={props.reader ?? toneReader()}
        startCapture={props.startCapture ?? captureDouble()}
        storage={props.storage ?? memoryStorage()}
        transport={props.transport ?? storyTransport()}
      />
      {props.controls}
    </div>
  );
}

function retainedRecord(snapshot: VideoSnapshot): PendingVideo {
  return {
    version: SONG_VIDEO_PENDING,
    principalId: "storybook-account",
    communityId: "community",
    personaId: "persona",
    file: new File(["take"], "take.mp4", { type: "video/mp4" }),
    caption: "",
    rating: "general",
    song: { songPostId: "song-post", audioRevision: 7, clipStartSamples: 0, clipDurationSamples: 30_000 * 48, selectedFrom: { kind: "library" } },
    reservation: {
      track: "video", intent: "song_reference", status: "awaiting_upload", slot: "primary_video",
      author_persona_id: "persona", ingest_policy_revision: 1, reservation_id: "reservation-story",
      song_reference: { song_post_id: "song-post", audio_revision: 7, song_asset_id: "song-asset" },
      reservation_policy_snapshot: { observed_at_transition: "media_reservation_issued", owner_policy_revision: 3, owner_policy_hash: "a".repeat(64), derivative_video: "allowed", observed_at: "2026-09-20T00:00:00Z" },
      interval: { clip_start_samples: 0, clip_duration_samples: 30_000 * 48, song_duration_samples: SONG_MS * 48 },
      upload: uploadPlan(1),
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
};

export const SongUnavailable: Story = {
  name: "Song unavailable",
  render: () => <Harness reader={async () => { throw new SongSourceError("not_found", "Song not found", false); }} />,
};

export const SongForbidden: Story = {
  name: "Song forbidden by its owner",
  render: () => <Harness preflight={forbiddenPreflight()} />,
};

export const ExcerptSelection: Story = {
  name: "Excerpt selection",
  render: () => <Harness />,
};

export const PreflightPending: Story = {
  name: "Preflight still measuring",
  render: () => <Harness preflight={measuringPreflight()} />,
};

export const PreflightRefused: Story = {
  name: "Preflight refused",
  render: () => <Harness preflight={refusedPreflight()} />,
};

export const RecordingReady: Story = {
  name: "Ready to record with the song",
  render: () => <Harness startCapture={captureDouble({ autoStopAfterMs: 60_000 })} />,
};

export const GuidedRecording: Story = {
  name: "Recording with the guide",
  render: () => <Harness autoStart startCapture={captureDouble({ autoStopAfterMs: 60_000 })} />,
};

export const GuideInterrupted: Story = {
  name: "Guide interrupted mid-take",
  render: () => (
    <Harness
      autoStart
      startCapture={captureDouble({ autoStopAfterMs: 60_000 })}
      controls={<Button class="mt-3" onClick={() => activeGuide?.emit("waiting")} variant="secondary">Stall the guide</Button>}
    />
  ),
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
};

export const ShortUploadedClip: Story = {
  name: "Uploaded clip shorter than the excerpt",
  render: () => <Harness chooseFile={() => sampleVideoFile(8_000)} measureDuration={async () => 9_000} />,
};

export const ExplainedTrimming: Story = {
  name: "Uploaded clip that will be trimmed",
  render: () => <Harness chooseFile={() => sampleVideoFile(12_000)} measureDuration={async () => 45_000} />,
};

export const ReviewPlayback: Story = {
  name: "Review with the intended soundtrack",
  render: () => <Harness chooseFile={() => sampleVideoFile(32_000)} measureDuration={async () => 32_000} />,
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
      fetchImpl={storyFetch({ delayMs: 2_000 })}
      measureDuration={async () => 45_000}
      transport={storyTransport({ slowParts: true })}
    />
  ),
};

export const UploadFailure: Story = {
  name: "Upload failure with a retry",
  render: () => (
    <Harness
      autoPublish
      chooseFile={() => sampleVideoFile(12_000)}
      measureDuration={async () => 45_000}
      transport={storyTransport({ finalize: "retryable_failure" })}
    />
  ),
};

export const Processing: Story = {
  name: "Processing after upload",
  render: () => {
    const snapshot: VideoSnapshot = { ...snapshotBase, status: "processing", phase: "analysis" };
    return <Harness storage={memoryStorage(retainedRecord(snapshot))} transport={retainedTransport(snapshot)} />;
  },
};

export const HeldForReview: Story = {
  name: "Held for review",
  render: () => {
    const snapshot: VideoSnapshot = { ...snapshotBase, status: "manual_review", reason_codes: ["media_review_required"], review_ref: "review-story" };
    return <Harness storage={memoryStorage(retainedRecord(snapshot))} transport={retainedTransport(snapshot)} />;
  },
};

export const Published: Story = {
  name: "Published",
  render: () => {
    const snapshot: VideoSnapshot = { ...snapshotBase, status: "published", creation_revision: 2, video_revision: 1, published_resource: { post_id: "post-story", href: "/posts/post-story" } };
    return <Harness storage={memoryStorage(retainedRecord(snapshot))} transport={retainedTransport(snapshot)} />;
  },
};

export const CameraDenied: Story = {
  name: "Camera permission denied",
  render: () => <Harness autoStart startCapture={captureDouble({ fail: "camera_denied" })} />,
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
