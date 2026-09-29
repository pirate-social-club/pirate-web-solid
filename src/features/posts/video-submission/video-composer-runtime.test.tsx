/** @jsxImportSource @solidjs/web */
import { render } from "@solidjs/web";
import { createRoot, flush } from "solid-js";
import { webcrypto } from "node:crypto";
import { ApiClientError } from "@pirate/api-client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { VideoComposerRuntime, type GuideAudio } from "./video-composer-runtime";
import type { OriginalVideoCaptureInput, VideoCaptureSession } from "./capture";
import type { PendingVideo, VideoStorage } from "./coordinator";
import type { VideoCommand, VideoTransport } from "./transport";
import type { VideoSnapshot } from "./contracts";
import type { SongIntervalPreflight } from "./song-reference";
import type { SongSourceReader } from "../post-composer/song-excerpt-source";
import type { GuidedTakeAlignment } from "./guided-take-alignment";
import { GUIDED_TAKE_MAX_DURATION_SECONDS } from "./clip-duration";

const disposers: (() => void)[] = [];
/** The injected capture entry point: tests place the next session here. */
let nextSession: (() => VideoCaptureSession) | undefined;
const startCapture = vi.fn(async (_input: OriginalVideoCaptureInput) => {
  if (!nextSession) throw new Error("this test did not stage a capture session");
  return nextSession();
});
/** A fake live camera: its tracks record whether anything stopped them. */
interface FakePreview { readonly stream: MediaStream; readonly stopped: () => boolean }
const previews: FakePreview[] = [];
let previewFailure: Error | undefined;
const openPreview = vi.fn(async (): Promise<MediaStream> => {
  if (previewFailure) throw previewFailure;
  let stops = 0;
  const track = { stop: () => { stops += 1; } };
  // SAFETY: the runtime only reads getTracks from the preview and assigns it
  // to the viewfinder; jsdom has no MediaStream.
  const stream = Object.assign(Object.create(null) as MediaStream, { getTracks: () => [track, track] });
  previews.push({ stream, stopped: () => stops > 0 });
  return stream;
});
afterEach(() => { for (const dispose of disposers.splice(0)) dispose(); document.body.replaceChildren(); nextSession = undefined; startCapture.mockClear(); openPreview.mockClear(); previews.length = 0; previewFailure = undefined; vi.unstubAllGlobals(); });
function setup(final: "published" | "manual_review" | "provider_submission_unconfirmed" | "membership_required" | "transform_failed", rejectKind?: "reserve" | "start", beforeExecute?: (command: VideoCommand) => Promise<void>) {
  vi.stubGlobal("crypto", webcrypto);
  const urlApi = class extends URL { static createObjectURL() { return "blob:https://example.test/video"; } static revokeObjectURL() {} };
  vi.stubGlobal("URL", urlApi);
  let saved: PendingVideo | null = null;
  const storage: VideoStorage = { async exclusive(work) { return work(); }, async load() { return saved; }, async save(record) { saved = record; }, async remove() { saved = null; } };
  // Every video references a song: the reservation echoes the chosen excerpt.
  const reserveEcho = async (body: VideoCommand["input"]["body"]) => {
    if (!("track" in body) || body.track !== "video" || body.intent !== "song_reference") throw new Error("expected a song video reservation");
    const echoed = {
      track: "video" as const, status: "awaiting_upload" as const, slot: "primary_video" as const, author_persona_id: "persona",
      ingest_policy_revision: 1, reservation_id: "reservation", intent: "song_reference" as const,
      upload: { method: "MULTIPART" as const, upload_id: "upload", part_count: 1, part_size_bytes: body.expected_size_bytes, expires_at: "2099-01-01T00:00:00Z", parts: [{ part_number: 1, url: "https://upload.example/1", expires_at: "2099-01-01T00:00:00Z" }] },
      song_reference: { song_post_id: body.song_post_id, audio_revision: body.audio_revision, song_asset_id: "song-asset" },
      reservation_policy_snapshot: { observed_at_transition: "media_reservation_issued" as const, owner_policy_revision: 3, owner_policy_hash: "a".repeat(64), derivative_video: "allowed" as const, observed_at: "2026-09-11T00:00:00Z" },
      interval: { clip_start_samples: body.clip_start_samples, clip_duration_samples: body.clip_duration_samples, song_duration_samples: 10_080_047 },
    };
    return (await import("./contracts")).verifySongReservation(body, echoed);
  };
  const common = { track: "video" as const, intent: "song_reference" as const, submission_id: "submission", author_persona: { object: "persona" as const, persona_id: "persona", display_name: null, avatar_ref: null, primary_public_handle: null }, creation_revision: 1, video_revision: 0, caption: "", updated_at: "2026-09-05T00:00:00Z", href: "/media-post-submissions/submission" };
  let snapshot: VideoSnapshot = { ...common, status: "processing", phase: "awaiting_upload" };
  const commands: VideoCommand[] = [];
  const transport: VideoTransport = { async read() { return snapshot; }, async execute(command) {
    commands.push(command); await beforeExecute?.(command);
    if (command.kind === rejectKind) throw new ApiClientError(
      { status: 400, code: "bad_request", name: "BadRequest", retryable: false },
      { error: { code: "bad_request", message: "Request refused", retryable: false } });
    if (command.kind === "reserve") return reserveEcho(command.input.body);
    if (command.kind === "cancel") {
      snapshot = { ...common, creation_revision: 2, video_revision: 1, status: "abandoned", reason_code: "author_abandoned_unresolved_provider" };
      return snapshot;
    }
    if (command.kind === "finalize") snapshot = final === "published"
      ? { ...common, creation_revision: 2, video_revision: 1, status: "published", published_resource: { post_id: "post", href: "/posts/post" } }
      : final === "manual_review"
        ? { ...common, creation_revision: 2, video_revision: 1, status: "manual_review", reason_codes: ["media_review_required"], review_ref: "review" }
        : { ...common, creation_revision: 2, video_revision: 1, status: "processing_failed", reason_code: final, retryable: final === "membership_required", retry_count: 0 };
    return snapshot;
  } };
  const published = vi.fn(); const posted = vi.fn(); const container = document.createElement("div"); document.body.appendChild(container);
  createRoot(dispose => { disposers.push(dispose); render(() => <VideoComposerRuntime principalId="account" communityId="community" personaId="persona"
    storage={storage} transport={transport} inspectFile={async file => file}
    fetchImpl={vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { headers: { etag: "receipt" } }))}
    songPreflight={acceptedPreflight} songReader={readableSong} initialSong={{ postId: "song-post" }}
    onExit={() => {}} onRetainedPersona={() => {}} onPublished={published} onPosted={posted} />, container); });
  return { commands, published, posted, retained: () => saved };
}
/** An interval preflight that measures the song and accepts every excerpt. */
const acceptedPreflight: SongIntervalPreflight = async input => ({
  state: "ready", song_post_id: input.body.song_post_id, audio_revision: 7, canonical_duration_samples: 10_080_047,
  interval_policy: { policy_revision: 1, sample_rate_hz: 48_000, min_clip_duration_samples: 144_000, max_clip_duration_samples: 8_640_000 },
  interval: input.body.interval === undefined ? null : { accepted: true },
});
const readableSong: SongSourceReader = async request => ({
  postId: request.kind === "post" ? request.postId : "song-post",
  audioUrl: "https://audio.example/song.mp3",
  title: "A song",
});
async function selectAndPublish() {
  // The song loads and its excerpt is accepted before the take is published.
  await vi.waitFor(() => expect(document.querySelector("audio")).not.toBeNull());
  const audio = document.querySelector("audio")!;
  Object.defineProperty(audio, "duration", { configurable: true, value: 210 });
  audio.dispatchEvent(new Event("loadedmetadata"));
  await vi.waitFor(() => expect(document.querySelector("[data-song-plan]")?.getAttribute("data-song-plan")).toBe("ready"), { timeout: 3_000 });
  const continueButton = [...document.querySelectorAll<HTMLButtonElement>("[data-song-choice-screen] button")]
    .find(button => button.textContent?.trim() === "Continue to video");
  continueButton?.click();
  await vi.waitFor(() => expect(document.querySelector("div[inert]:not([data-song-choice-screen])")).toBeNull());
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["video"], "take.mp4", { type: "video/mp4" })] });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
  const publish = [...document.querySelectorAll("button")].find(button => button.textContent?.trim() === "Publish video")!;
  await vi.waitFor(() => expect(publish.disabled).toBe(false)); publish.click();
}
describe("mounted video flow", () => {
  test.each(["reserve", "start"] as const)("a rejected %s returns to editing only on explicit action", async kind => {
    const fixture = setup("published", kind); await selectAndPublish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("This video wasn’t accepted."));
    const commandCount = fixture.commands.length;
    expect([...document.querySelectorAll("button")].some(button => button.textContent?.includes("Try again"))).toBe(false);
    const edit = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("Edit rejected video"))!;
    await vi.waitFor(() => expect(edit.disabled).toBe(false)); edit.click();
    await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
    expect(document.body.textContent).toContain("Publish video");
    expect(fixture.commands).toHaveLength(commandCount);
    expect(fixture.published).not.toHaveBeenCalled();
  });
  test("reserves, uploads and finalizes without a title, terms or client poster", async () => {
    const fixture = setup("published"); await selectAndPublish();
    await vi.waitFor(() => expect(fixture.posted).toHaveBeenCalledOnce());
    expect(fixture.published).toHaveBeenCalledOnce();
    expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]);
    expect(fixture.commands[0]?.input.body).toMatchObject({ intent: "song_reference", persona_id: "persona", song_post_id: "song-post" });
    expect(fixture.commands[1]?.input.body).not.toHaveProperty("title");
    expect(fixture.commands[2]?.input.body).toMatchObject({ parts: [{ part_number: 1, etag: "receipt" }] });
  });
  test.each(["published", "manual_review", "transform_failed", "membership_required", "provider_submission_unconfirmed"] as const)(
    "once the upload is sealed (%s) the author goes to the feed and the device forgets the video", async final => {
      const fixture = setup(final); await selectAndPublish();
      await vi.waitFor(() => expect(fixture.posted).toHaveBeenCalledOnce());
      expect(fixture.retained()).toBeNull();
      expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]);
      expect(document.body.textContent).not.toMatch(/Waiting for review|Check video status|Start a new video|Start over|Retry|Try again|Cancel upload|Resume video submission|Abandon/);
    });
});


/** A video the author already submitted for publication, retained with its
 * upload still owed, and the composer opened on it again. */
const SEALED_OUTCOMES = ["processing", "manual_review", "processing_failed", "blocked", "abandoned", "published"] as const;
function reopenedWithSubmittedUpload(options: {
  readonly communityId?: string;
  readonly failFirstUpload?: boolean;
  /** The retained video's upload finished: the server owns it, in this outcome. */
  readonly sealed?: typeof SEALED_OUTCOMES[number];
} = {}) {
  vi.stubGlobal("crypto", webcrypto);
  const urlApi = class extends URL { static createObjectURL() { return "blob:https://example.test/video"; } static revokeObjectURL() {} };
  vi.stubGlobal("URL", urlApi);
  const base = {
    submission_id: "video-submission", author_persona: { object: "persona" as const, persona_id: "persona", display_name: null, avatar_ref: null, primary_public_handle: null },
    href: "/media-post-submissions/video-submission", track: "video" as const, intent: "original_audio" as const, creation_revision: 1,
    video_revision: 0, caption: "", updated_at: "2026-09-05T00:00:00Z",
  };
  const snapshot: VideoSnapshot = { ...base, status: "processing", phase: "awaiting_upload" };
  const sealedAt = { ...base, creation_revision: 2, video_revision: 1 };
  const sealedSnapshots: Record<typeof SEALED_OUTCOMES[number], VideoSnapshot> = {
    processing: { ...sealedAt, status: "processing", phase: "analysis" },
    manual_review: { ...sealedAt, status: "manual_review", reason_codes: ["media_review_required"], review_ref: "review" },
    processing_failed: { ...sealedAt, status: "processing_failed", reason_code: "transform_failed", retryable: false, retry_count: 0 },
    blocked: { ...sealedAt, status: "blocked", reason_code: "policy_violation" },
    abandoned: { ...sealedAt, status: "abandoned", reason_code: "author_cancelled_before_finalize" },
    published: { ...sealedAt, status: "published", published_resource: { post_id: "post", href: "/posts/post" } },
  };
  const held = options.sealed ? sealedSnapshots[options.sealed] : snapshot;
  let saved: PendingVideo | null = {
    version: "original-video-pending-v1", principalId: "account", communityId: options.communityId ?? "community", personaId: "persona",
    file: new File(["video"], "take.mp4", { type: "video/mp4" }), caption: "", rating: "general", receipts: [], pending: null, snapshot: held,
    reservation: { reservation_id: "reservation", track: "video", intent: "original_audio", slot: "primary_video", status: "awaiting_upload", author_persona_id: "persona", ingest_policy_revision: 1,
      upload: { method: "MULTIPART", upload_id: "upload", part_size_bytes: 10, part_count: 1, expires_at: "2099-01-01T00:00:00Z", parts: [{ part_number: 1, url: "https://upload.example/1", expires_at: "2099-01-01T00:00:00Z" }] } },
  };
  const storage: VideoStorage = {
    async exclusive(work) { return work(); }, async load() { return saved; }, async save(record) { saved = record; }, async remove() { saved = null; },
  };
  const execute = vi.fn(async () => ({ ...snapshot, phase: "analysis" as const }));
  let uploads = 0;
  const fetchImpl = vi.fn<typeof fetch>();
  fetchImpl.mockImplementation(async () => {
    uploads += 1;
    if (options.failFirstUpload && uploads === 1) throw new TypeError("network down");
    return new Response(null, { headers: { etag: "receipt" } });
  });
  const posted = vi.fn();
  const container = document.createElement("div"); document.body.appendChild(container);
  createRoot(dispose => { disposers.push(dispose); render(() => <VideoComposerRuntime principalId="account" communityId="community" personaId="persona"
    storage={storage} transport={{ execute, async read() { return held; } }} inspectFile={async file => file} fetchImpl={fetchImpl}
    songPreflight={acceptedPreflight} songReader={readableSong} initialSong={{ postId: "song-post" }}
    onExit={() => {}} onRetainedPersona={() => {}} onPosted={posted} />, container); });
  return { execute, fetchImpl, posted, retained: () => saved };
}
const controlLabels = () => [...document.querySelectorAll("button")].map(control => control.textContent?.trim());
const controlLabeled = (label: string) => [...document.querySelectorAll("button")].find(control => control.textContent?.trim() === label);

describe("a submitted upload when the composer is reopened", () => {
  test("resumes on its own and never asks the author to press anything", async () => {
    const fixture = reopenedWithSubmittedUpload();
    await vi.waitFor(() => expect(fixture.posted).toHaveBeenCalledOnce(), { timeout: 5_000 });
    expect(fixture.fetchImpl).toHaveBeenCalledOnce();
    expect(fixture.execute).toHaveBeenCalledOnce();
    expect(fixture.retained()).toBeNull();
    expect(document.body.textContent).not.toMatch(/Resume video submission|Pause upload|Check video status|Cancel video submission/);
  });

  test("after a failed attempt offers Try again and Cancel upload and nothing else", async () => {
    const fixture = reopenedWithSubmittedUpload({ failFirstUpload: true });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Your video hasn't finished uploading."), { timeout: 5_000 });
    expect(document.body.textContent).toContain("We couldn’t reach the upload server. Check your connection and try again.");
    expect(document.body.textContent).not.toMatch(/network down|Failed to fetch/);
    expect(controlLabels()).toEqual(expect.arrayContaining(["Try again", "Cancel upload"]));
    expect(document.body.textContent).not.toMatch(/Resume video submission|Pause upload|Check video status/);
    expect(fixture.posted).not.toHaveBeenCalled();
    controlLabeled("Try again")!.click();
    await vi.waitFor(() => expect(fixture.posted).toHaveBeenCalledOnce(), { timeout: 5_000 });
    expect(fixture.fetchImpl).toHaveBeenCalledTimes(2);
  });

  test.each(SEALED_OUTCOMES)("a video whose upload already finished (%s) is forgotten and the composer opens fresh", async sealed => {
    const fixture = reopenedWithSubmittedUpload({ sealed });
    await vi.waitFor(() => expect(fixture.retained()).toBeNull(), { timeout: 5_000 });
    // The author is back at the start of a new video, with nothing to resume,
    // check, cancel or retry, and nothing was uploaded or sent again.
    await vi.waitFor(() => expect(document.querySelector("[data-song-choice-screen]")).not.toBeNull());
    expect(document.body.textContent).not.toMatch(/Resume video submission|Pause upload|Check video status|Cancel video submission|Cancel upload|Try again|Start over|Start a new video|Uploading video|hasn't finished uploading/);
    expect(fixture.fetchImpl).not.toHaveBeenCalled();
    expect(fixture.execute).not.toHaveBeenCalled();
    expect(fixture.posted).not.toHaveBeenCalled();
  });

  test("a video that belongs to another community waits and says so plainly", async () => {
    const fixture = reopenedWithSubmittedUpload({ communityId: "another-community" });
    await vi.waitFor(() => expect(document.body.textContent).toContain("Your video hasn't finished uploading."));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(fixture.fetchImpl).not.toHaveBeenCalled();
    expect(fixture.execute).not.toHaveBeenCalled();
    controlLabeled("Try again")!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Your earlier video is still uploading for another community. Open that community to finish it."));
    // No identifiers and no word the author has to know.
    expect(document.body.textContent).not.toMatch(/persona|retained|original community/i);
    expect(fixture.fetchImpl).not.toHaveBeenCalled();
    expect(fixture.retained()).not.toBeNull();
  });
});

test("unmount during reservation preserves it without starting upload", async () => {
  let release!: () => void; const waiting = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  const fixture = setup("published", undefined, async command => {
    if (command.kind === "reserve") { entered(); await waiting; }
  });
  await selectAndPublish(); await started; disposers.pop()!(); release();
  await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve"]));
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(fixture.commands.map(command => command.kind)).toEqual(["reserve"]);
  expect(fixture.published).not.toHaveBeenCalled();
});

describe("mounted song-first video flow", () => {
  const ready = (interval: { accepted: true } | { accepted: false; reason: "interval_too_long" } | null) => ({
    state: "ready" as const, song_post_id: "song-post", audio_revision: 7, canonical_duration_samples: 10_080_047,
    interval_policy: { policy_revision: 1, sample_rate_hz: 48_000 as const, min_clip_duration_samples: 144_000, max_clip_duration_samples: 8_640_000 },
    interval,
  });
  const unavailable = () => new ApiClientError({ status: 400, code: "bad_request", name: "BadRequest", retryable: false },
    { error: { code: "bad_request", message: "Video capability is unavailable", retryable: false,
      details: { reason_code: "capability_unavailable", track: "video", capability: "song_reference" } } });

  function songSetup(options: {
    readonly preflight: "unavailable" | "accepted" | "refused" | "pending";
    /** The review-time profile choices, when the host offers them. */
    readonly personaOptions?: readonly { readonly id: string; readonly label: string; readonly communityId?: string }[];
    readonly reserve?: "echo" | "different_excerpt";
    readonly finalSnapshot?: "published" | "song_blocked";
    readonly reader?: "ready" | "failed" | "pending";
    /** What the injected duration measurement answers for the chosen file. */
    readonly clipDurationMs?: number | null;
    /** The audio element's length, when the injected metadata reports one. */
    readonly elementSeconds?: number;
    readonly initialSong?: boolean;
    readonly mobile?: boolean;
    readonly createGuideAudio?: (url: string) => GuideAudio;
    readonly onGuideTiming?: (timing: { readonly startDelayMs: number }) => void;
    readonly alignTake?: (file: File, offsetMs: number) => Promise<GuidedTakeAlignment>;
    /** Hold each interval preflight open so a stale answer can be resolved on
     * command; timing (no-interval) requests still answer immediately. */
    readonly deferIntervalChecks?: boolean;
    /** Lose the first finalize response, before or after the server commits it. */
    readonly loseFinalize?: "before_commit" | "after_commit";
    /** While set, reading the submission fails as a network error would. */
    readonly readFails?: { value: boolean };
    readonly onPosted?: () => void;
  }) {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("URL", class extends URL { static createObjectURL() { return "blob:https://example.test/video"; } static revokeObjectURL() {} });
    if (options.mobile) {
      // jsdom validates srcObject assignments against its own media element
      // implementation; the viewfinder preview only needs the assignment to
      // stick, and no media decoding happens in these tests.
      for (const prototype of [HTMLMediaElement.prototype, HTMLVideoElement.prototype]) {
        try {
          Object.defineProperty(prototype, "srcObject", {
            configurable: true,
            get(this: { _testSrcObject?: unknown }) { return this._testSrcObject; },
            set(this: { _testSrcObject?: unknown }, value: unknown) { this._testSrcObject = value; },
          });
        } catch { /* the real accessor stays in place */ }
      }
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: true, media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {},
        addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
      }));
    }
    let saved: PendingVideo | null = null;
    const storage: VideoStorage = { async exclusive(work) { return work(); }, async load() { return saved; }, async save(record) { saved = record; }, async remove() { saved = null; } };
    // The plan must match the sealed file exactly, as the real server's does.
    const uploadFor = (sizeBytes: number) => ({ method: "MULTIPART" as const, upload_id: "upload", part_count: 1, part_size_bytes: sizeBytes, expires_at: "2099-01-01T00:00:00Z", parts: [{ part_number: 1, url: "https://upload.example/1", expires_at: "2099-01-01T00:00:00Z" }] });
    const upload = uploadFor(10);
    const base = { track: "video" as const, status: "awaiting_upload" as const, slot: "primary_video" as const, author_persona_id: "persona", ingest_policy_revision: 1, reservation_id: "reservation", upload };
    const preflightCalls: unknown[] = [];
    const pendingChecks: (() => void)[] = [];
    const preflight: SongIntervalPreflight = async input => {
      preflightCalls.push(input.body);
      if (options.preflight === "unavailable") throw unavailable();
      if (options.preflight === "pending") return new Promise(() => {});
      if (options.deferIntervalChecks && input.body.interval !== undefined) {
        return new Promise(resolve => {
          pendingChecks.push(() => resolve({ ...ready({ accepted: true as const }), song_post_id: input.body.song_post_id }));
        });
      }
      const verdict = options.preflight === "refused" && input.body.interval !== undefined
        ? { accepted: false as const, reason: "interval_too_long" as const }
        : input.body.interval === undefined ? null : { accepted: true as const };
      return { ...ready(verdict), song_post_id: input.body.song_post_id };
    };
    const common = { track: "video" as const, intent: "song_reference" as const, submission_id: "submission", author_persona: { object: "persona" as const, persona_id: "persona", display_name: null, avatar_ref: null, primary_public_handle: null }, creation_revision: 1, video_revision: 0, caption: "", updated_at: "2026-09-11T00:00:00Z", href: "/media-post-submissions/submission" };
    let snapshot: VideoSnapshot = { ...common, status: "processing", phase: "awaiting_upload" };
    const commands: VideoCommand[] = [];
    let loseFinalize = options.loseFinalize;
    const transport: VideoTransport = { async read() {
      if (options.readFails?.value) throw new Error("offline");
      return snapshot;
    }, async execute(command) {
      commands.push(command);
      if (command.kind === "finalize" && loseFinalize === "before_commit") { loseFinalize = undefined; throw new Error("provider_unavailable"); }
      if (command.kind === "reserve") {
        const body = command.input.body;
        if (body.track !== "video") throw new Error("not a video");
        if (body.intent === "original_audio") return { ...base, upload: uploadFor(body.expected_size_bytes), intent: "original_audio" };
        const interval = { clip_start_samples: body.clip_start_samples, clip_duration_samples: body.clip_duration_samples, song_duration_samples: 10_080_047 };
        const echoed = {
          ...base, upload: uploadFor(body.expected_size_bytes), intent: "song_reference" as const,
          song_reference: { song_post_id: body.song_post_id, audio_revision: body.audio_revision, song_asset_id: "song-asset" },
          reservation_policy_snapshot: { observed_at_transition: "media_reservation_issued" as const, owner_policy_revision: 3, owner_policy_hash: "a".repeat(64), derivative_video: "allowed" as const, observed_at: "2026-09-11T00:00:00Z" },
          interval: options.reserve === "different_excerpt" ? { ...interval, clip_start_samples: interval.clip_start_samples + 48 } : interval,
        };
        // The real transport's check, so a differing echo fails exactly as it would.
        return (await import("./contracts")).verifySongReservation(body, echoed);
      }
      if (command.kind === "finalize") snapshot = options.finalSnapshot === "song_blocked"
        ? { ...common, creation_revision: 2, video_revision: 1, status: "blocked", reason_code: "song_reference_invalid", song_post_id: "song-post", song_reason_code: "derivative_video_blocked" }
        : { ...common, creation_revision: 2, video_revision: 1, status: "published", published_resource: { post_id: "post", href: "/posts/post" } };
      if (command.kind === "finalize" && loseFinalize === "after_commit") { loseFinalize = undefined; throw new Error("provider_unavailable"); }
      return snapshot;
    } };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { headers: { etag: "receipt" } }));
    const alignments: { readonly offsetMs: number; readonly file: File }[] = [];
    const inspectOptions: ({ readonly maxDurationSeconds?: number } | undefined)[] = [];
    const alignTake = options.alignTake ?? (async (file: File, offsetMs: number) => {
      alignments.push({ offsetMs, file });
      return { file, trimmedMs: offsetMs, requestedMs: offsetMs, aligned: true };
    });
    const songReader: SongSourceReader = options.reader === "failed"
      ? async () => { throw new Error("read failed"); }
      : options.reader === "pending"
      ? () => new Promise(() => {})
      : async request => ({
        postId: request.kind === "post" ? request.postId : "song-post",
        audioUrl: "https://audio.example/song.mp3",
        title: "A song",
      });
    const container = document.createElement("div"); document.body.appendChild(container);
    createRoot(dispose => { disposers.push(() => { dispose(); localStorage.clear(); }); render(() => <VideoComposerRuntime principalId="account" communityId="community" personaId="persona"
      storage={storage} transport={transport} inspectFile={async (file, options) => { inspectOptions.push(options); return file; }} fetchImpl={fetchImpl}
      measureDuration={async () => options.clipDurationMs ?? null}
      startCapture={startCapture}
      openPreview={openPreview}
      createGuideAudio={options.createGuideAudio}
      alignTake={alignTake}
      onGuideTiming={options.onGuideTiming}
      songPreflight={preflight} songReader={songReader}
      personaOptions={options.personaOptions}
      initialSong={options.initialSong === false ? undefined : { postId: "song-post" }}
      {...(options.onPosted ? { onPosted: options.onPosted } : {})}
      onExit={() => {}} onRetainedPersona={() => {}} />, container); });
    return { commands, preflightCalls, pendingChecks, fetchImpl, alignments, inspectOptions, current: () => saved };
  }

  const button = (label: string) => [...document.querySelectorAll("button")].find(candidate => candidate.textContent?.trim() === label);
  const plan = () => document.querySelector("[data-song-plan]");
  const soundtrackPanel = () => document.querySelector<HTMLElement>("[data-song-choice-screen]");
  async function continueToVideo() {
    if (soundtrackPanel()?.getAttribute("aria-hidden") === "true") return;
    const control = button("Continue to video");
    if (!control || control.disabled) return;
    control.click();
    await vi.waitFor(() => expect(soundtrackPanel()?.getAttribute("aria-hidden")).toBe("true"));
  }
  async function loadSongMetadata(seconds = 210) {
    await vi.waitFor(() => expect(document.querySelector("audio")).not.toBeNull());
    const audio = document.querySelector("audio")!;
    Object.defineProperty(audio, "duration", { configurable: true, value: seconds });
    audio.dispatchEvent(new Event("loadedmetadata"));
  }
  async function awaitPlan(kind: string) {
    await vi.waitFor(() => expect(plan()?.getAttribute("data-song-plan")).toBe(kind), { timeout: 3_000 });
    if (kind === "ready") await continueToVideo();
  }
  async function chooseFile() {
    await vi.waitFor(() => expect(document.querySelector("div[inert]:not([data-song-choice-screen])")).toBeNull());
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["video"], "take.mp4", { type: "video/mp4" })] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
  }
  /** Stages a file through the hidden input without waiting for the review
   * screen, for asserting the capture gate refuses it. */
  function attemptFile() {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) return;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["video"], "take.mp4", { type: "video/mp4" })] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  /** Chooses a song by pasting its `/p/<id>` link into the picker; a song
   * already loaded is changed out first through the composer's control. */
  async function pickSongByLink(link: string) {
    const change = [...document.querySelectorAll("button")].find(candidate => candidate.textContent === "Change song" || candidate.textContent === "Change");
    if (change !== undefined) {
      change.click();
      await vi.waitFor(() => expect(document.querySelector('input[aria-label="Search songs or paste a link"]')).not.toBeNull());
    }
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Search songs or paste a link"]');
    if (input === null) throw new Error("the song picker is not on screen");
    input.value = link;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const use = await vi.waitFor(() => {
      const button = [...document.querySelectorAll("button")].find(candidate => candidate.textContent === "Use the song at this link");
      expect(button).toBeDefined();
      if (!button) throw new Error("song link action is missing");
      return button;
    });
    use.click();
  }
  async function publish() {
    const control = button("Publish video")!;
    await vi.waitFor(() => expect(control.disabled).toBe(false)); control.click();
  }

  test("the excerpt is chosen before any clip, and the capture surface sits below it", async () => {
    const fixture = songSetup({ preflight: "accepted" });
    // The song loads from the entry without a paste step or a chosen file.
    await loadSongMetadata();
    await awaitPlan("ready");
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.querySelector('input[aria-label="Song link or post id"]')).toBeNull();
    expect(document.body.textContent).toContain("A song");
    expect(document.querySelector("audio")?.getAttribute("src")).toBe("https://audio.example/song.mp3");
    expect(fixture.preflightCalls).toContainEqual({ song_post_id: "song-post" });
    // The default window is the opening fifteen seconds, and it is dragged as a
    // whole: the selector exposes one position control, not endpoint resizers.
    expect(document.querySelector('[role="slider"][aria-label="Where the song starts"]')).not.toBeNull();
    expect(document.querySelectorAll('[role="slider"]')).toHaveLength(1);
    expect(document.querySelector('[data-excerpt-track]')).toBeNull();
    expect(document.querySelector('input[aria-label="Excerpt start, resizes the excerpt without moving its end"]')).toBeNull();
    // The recording that will carry it is the same length; nothing has been
    // uploaded or recorded yet.
    expect(fixture.commands).toHaveLength(0);
  });

  test("a shorter clip uses as much of the song as it lasts, from the same start", async () => {
    const fixture = songSetup({ preflight: "accepted", clipDurationMs: 9_000 });
    await loadSongMetadata();
    await awaitPlan("ready");
    await chooseFile();
    console.log("SHORTER CLIP TEXT:", document.body.textContent?.slice(0, 400));
    await vi.waitFor(() => expect(document.body.textContent).toContain("A song · 0:00 to 0:09"));
    await awaitPlan("ready");
    expect(document.body.textContent).not.toContain("Record again");
    await publish();
    await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]));
    expect(fixture.commands[0]?.input.body).toMatchObject({
      intent: "song_reference", clip_start_samples: 0, clip_duration_samples: Math.floor(9_000 - 1_000 / 30) * 48,
    });
  });

  test("a clip under three seconds is refused locally, with no futile retry", async () => {
    const fixture = songSetup({ preflight: "accepted", clipDurationMs: 2_000 });
    await loadSongMetadata();
    await awaitPlan("ready");
    await chooseFile();
    await vi.waitFor(() => expect(document.body.textContent).toContain("at least 3 seconds"));
    await publish();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(fixture.commands).toHaveLength(0);
    expect(button("Use original sound")).toBeUndefined();
  });

  test("a clip slightly past the window says it will be trimmed and publishes with the song", async () => {
    const fixture = songSetup({ preflight: "accepted", clipDurationMs: 16_000 });
    await loadSongMetadata();
    await awaitPlan("ready");
    await chooseFile();
    await vi.waitFor(() => expect(document.body.textContent).toContain("trimmed to the excerpt"));
    await publish();
    await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]));
    expect(fixture.commands[0]?.input.body).toMatchObject({
      intent: "song_reference", song_post_id: "song-post", audio_revision: 7, selected_from: { kind: "library" },
      clip_start_samples: 0, clip_duration_samples: 15_000 * 48,
    });
  });

  test("an upload longer than 15 seconds is refused, never cut", async () => {
    const fixture = songSetup({ preflight: "accepted", clipDurationMs: 45_000 });
    await loadSongMetadata();
    await awaitPlan("ready");
    await chooseFile();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Videos can be up to 15 seconds. This one lasts 0:45"));
    await publish();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(fixture.commands).toHaveLength(0);
  });

  test("review plays the intended soundtrack locally and mutes the captured audio", async () => {
    songSetup({ preflight: "accepted", clipDurationMs: 16_000 });
    await loadSongMetadata();
    await awaitPlan("ready");
    await chooseFile();
    await vi.waitFor(() => expect(button("Play with the song")).toBeDefined());
    const video = document.querySelector("video")!;
    // jsdom does not reflect the media `muted` IDL property; the attribute is
    // what the browser applies on mount.
    expect(video.hasAttribute("muted")).toBe(true);
    expect(document.querySelector('button')?.textContent).toBeDefined();
    expect(button("Play with the song")).toBeDefined();
    // Review names the song and nothing else: no source, poster or rights
    // summary competes with the caption and Publish.
    expect(document.body.textContent).toContain("A song · 0:00 to 0:15");
    expect(document.body.textContent).not.toContain("Poster");
    expect(document.body.textContent).not.toContain("Rights");
    expect(soundtrackPanel()?.getAttribute("aria-hidden")).toBe("true");
  });

  test("the sound sheet stays closed behind the song chip until it is tapped", async () => {
    songSetup({ preflight: "accepted", mobile: true });
    await loadSongMetadata();
    await awaitPlan("ready");
    const sheet = () => document.querySelector<HTMLElement>("[data-song-choice-screen]");
    await vi.waitFor(() => expect(sheet()?.getAttribute("aria-hidden")).toBe("true"));
    const chip = document.querySelector<HTMLButtonElement>('button[aria-label^="Song: A song"]')!;
    expect(chip.textContent).toContain("A song · 0:00 to 0:15");
    chip.click();
    await vi.waitFor(() => expect(sheet()?.getAttribute("aria-hidden")).toBeNull());
    button("Continue to video")!.click();
    await vi.waitFor(() => expect(sheet()?.getAttribute("aria-hidden")).toBe("true"));
  });

  test("a refused song stays on the song screen with its reason", async () => {
    songSetup({ preflight: "refused", mobile: true });
    await loadSongMetadata();
    await awaitPlan("refused");
    const sheet = () => document.querySelector<HTMLElement>("[data-song-choice-screen]");
    expect(sheet()?.getAttribute("aria-hidden")).toBeNull();
    expect(document.querySelector('button[aria-label="Start recording"]')).toBeNull();
    expect(document.body.textContent).toContain("longer than the server allows");
  });

  test("with the capability off, the video cannot be captured or published", async () => {
    const fixture = songSetup({ preflight: "unavailable" });
    await loadSongMetadata();
    await awaitPlan("not_available");
    // Both capture channels are gated on an accepted excerpt, so a staged
    // file is refused rather than surfacing the refusal at publish.
    attemptFile();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(document.querySelector("textarea")).toBeNull();
    expect(fixture.commands).toHaveLength(0);
    // Every video references a song: there is no way to publish without it.
    expect(button("Use original sound")).toBeUndefined();
  });

  test("a refused window blocks capture and publishing with the song, and says why", async () => {
    const fixture = songSetup({ preflight: "refused" });
    await loadSongMetadata();
    await awaitPlan("refused");
    expect(document.body.textContent).toContain("longer than the server allows");
    attemptFile();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(document.querySelector("textarea")).toBeNull();
    expect(fixture.commands).toHaveLength(0);
  });

  test("with no measurement, the server keeps the final word", async () => {
    const fixture = songSetup({ preflight: "accepted", clipDurationMs: null });
    await loadSongMetadata();
    await awaitPlan("ready");
    await chooseFile();
    await publish();
    await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]));
    expect(fixture.commands[0]?.input.body).toMatchObject({ intent: "song_reference" });
  });

  function guideSpy(options: {
    readonly fails?: boolean;
    /** Never settle the playback start; the runtime's own timeout must. */
    readonly stalls?: boolean;
    /** Settle the playback start after this delay. */
    readonly startAfterMs?: number;
    /** Hold the playback start until the test releases it. */
    readonly manual?: boolean;
    /** How far the element holds the song from 0, in seconds; absent means
     * the element cannot report it. */
    readonly buffered?: { end: number };
  } = {}) {
    const events = new Map<string, () => void>();
    const calls = { play: 0, pause: 0, resolved: 0 };
    let release: (() => void) | undefined;
    const audio: GuideAudio = {
      currentTime: 0,
      play: async () => {
        calls.play += 1;
        if (options.fails) throw new Error("not allowed");
        if (options.stalls) return new Promise<void>(() => {});
        if (options.startAfterMs !== undefined) {
          await new Promise<void>(resolve => { release = resolve; setTimeout(resolve, options.startAfterMs); });
        } else if (options.manual) {
          await new Promise<void>(resolve => { release = resolve; });
        }
        calls.resolved += 1;
        events.get("playing")?.();
      },
      pause: () => { calls.pause += 1; },
      addEventListener: (type, listener) => { events.set(type, listener); },
      removeEventListener: (type) => { events.delete(type); },
    };
    const held = options.buffered;
    if (held) Object.defineProperty(audio, "buffered", { value: {
      get length() { return held.end > 0 ? 1 : 0; },
      start: () => 0, end: () => held.end,
    } });
    return { audio, calls, events, release: () => release?.() };
  }
  function fakeSession(stopped: () => void, options: { readonly captureOriginMs?: number } = {}): VideoCaptureSession {
    return {
      // SAFETY: the viewfinder preview is not what these tests drive, and
      // jsdom has no MediaStream to give it; the runtime only assigns it.
      stream: Object.create(null) as MediaStream,
      captureOriginMs: options.captureOriginMs ?? performance.now(),
      stop: async () => { stopped(); return new File(["take"], "take.mp4", { type: "video/mp4" }); },
      cancel: async () => {},
    };
  }
  async function startRecording() {
    await vi.waitFor(() => expect(document.querySelector("div[inert]:not([data-song-choice-screen])")).toBeNull());
    await vi.waitFor(() => expect(document.querySelector('button[aria-label="Start recording"]')).not.toBeNull());
    document.querySelector<HTMLButtonElement>('button[aria-label="Start recording"]')!.click();
  }
  async function stopRecording() {
    await vi.waitFor(() => expect(document.querySelector('button[aria-label="Stop recording"]')).not.toBeNull());
    document.querySelector<HTMLButtonElement>('button[aria-label="Stop recording"]')!.click();
  }
  function moveWindow(startMs: number) {
    const slider = document.querySelector<HTMLElement>('[role="slider"][aria-label="Where the song starts"]')!;
    slider.focus();
    for (let step = 0; step < startMs / 1_000; step += 1) {
      slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
      flush();
    }
    expect(slider.getAttribute("aria-valuenow")).toBe(String(startMs));
  }

  test("recording plays the guide and stops at the excerpt plus its tail guard", async () => {
    const guide = guideSpy();
    let stopped = 0;
    nextSession = () => fakeSession(() => { stopped += 1; });
    songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guide.audio });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(startCapture).toHaveBeenCalledTimes(1));
    const input = startCapture.mock.calls[0]?.[0];
    // Thirty seconds of excerpt plus the tail the render discards, so frame
    // rounding cannot make the take too short.
    expect(input.limitMs).toBe(16_250);
    await vi.waitFor(() => expect(guide.calls.play).toBe(1));
    expect(guide.audio.currentTime).toBe(0);
    await vi.waitFor(() => expect(document.body.textContent).toContain("Recording to A song"));
    expect(stopped).toBe(0);
  });

  test("a guide that will not play cancels the take and says so", async () => {
    const guide = guideSpy({ fails: true });
    let stopped = 0;
    nextSession = () => fakeSession(() => { stopped += 1; });
    const fixture = songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guide.audio });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(document.body.textContent).toContain("guide song would not play"));
    await vi.waitFor(() => expect(document.body.textContent).toContain("did not start"));
    expect(stopped).toBe(0);
    expect(fixture.commands).toHaveLength(0);
    expect(document.querySelector('button[aria-label="Start recording"]')).not.toBeNull();
  });

  test("hiding the page ends a guided take rather than letting the sound drift", async () => {
    const guide = guideSpy();
    let stopped = 0;
    nextSession = () => fakeSession(() => { stopped += 1; });
    songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guide.audio });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(guide.calls.play).toBe(1));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    try {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.waitFor(() => expect(document.body.textContent).toContain("page was hidden"));
      await vi.waitFor(() => expect(stopped).toBe(1));
    } finally {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    }
  });

  test("a song that cannot be read blocks capture and publishing", async () => {
    const fixture = songSetup({ preflight: "accepted", reader: "failed" });
    await vi.waitFor(() => expect(document.body.textContent).toContain("couldn’t load"));
    // A failed read keeps the author's song choice but no excerpt can be
    // accepted, so neither capture channel opens and nothing is staged.
    attemptFile();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(document.querySelector("textarea")).toBeNull();
    expect(fixture.commands).toHaveLength(0);
    // Every video references a song: there is no way to publish without it.
    expect(button("Use original sound")).toBeUndefined();
  });

  test("moving the window invalidates the previous approval immediately", async () => {
    const fixture = songSetup({ preflight: "accepted", clipDurationMs: 16_000 });
    await loadSongMetadata();
    await awaitPlan("ready");
    await chooseFile();
    moveWindow(2_000);
    // The moved window is still tracked — the pending state is the composer's
    // data attribute — but it is machinery, not copy: no status text appears
    // for the author to read on every scrub adjustment.
    expect(document.querySelector('[data-song-plan="checking"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain("Checking this part of the song");
    expect(document.body.textContent).not.toContain("Waiting for the song check");
    // Publishing immediately, before the debounce can re-check, must not
    // submit the window the author just moved away from.
    await publish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("still being checked"));
    expect(fixture.commands).toHaveLength(0);
    await awaitPlan("ready");
    await publish();
    await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]));
    expect(fixture.commands[0]?.input.body).toMatchObject({
      intent: "song_reference", clip_start_samples: 2_000 * 48, clip_duration_samples: 15_000 * 48,
    });
  });

  test("capture stays closed until the server accepts this exact excerpt", async () => {
    nextSession = () => fakeSession(() => {});
    const fixture = songSetup({ preflight: "accepted", mobile: true, deferIntervalChecks: true });
    await loadSongMetadata();
    // The interval check is held open: while it pends, no status text
    // appears anywhere — the pending state lives on the confirm action —
    // and no capture channel opens.
    await awaitPlan("checking");
    await vi.waitFor(() => expect(fixture.pendingChecks.length).toBe(1), { timeout: 3_000 });
    expect(document.body.textContent).not.toContain("Checking this part of the song");
    expect(document.body.textContent).not.toContain("Waiting for the song check");
    // The record control is present but inert: without a song nothing
    // starts, and the view says what is missing instead.
    document.querySelector<HTMLButtonElement>('button[aria-label="Start recording"]')?.click();
    expect(startCapture).not.toHaveBeenCalled();
    expect(previews).toHaveLength(0);
    fixture.pendingChecks.forEach(resolve => resolve());
    await awaitPlan("ready");
    await vi.waitFor(() => expect(document.querySelector('button[aria-label="Start recording"]')).not.toBeNull());
    expect(startCapture).not.toHaveBeenCalled();
  });


  test("confirming the sound waits for the check and closes the sheet itself", async () => {
    const fixture = songSetup({ preflight: "accepted", mobile: true, deferIntervalChecks: true });
    await loadSongMetadata();
    await vi.waitFor(() => expect(fixture.pendingChecks.length).toBe(1), { timeout: 3_000 });
    // Song choice is already open. Confirming while the excerpt is checked
    // keeps progress on the button and opens capture after acceptance.
    await vi.waitFor(() => expect(document.querySelector("[data-song-choice-screen]")?.getAttribute("aria-hidden")).toBeNull());
    const confirm = [...document.querySelectorAll("button")].find(button => button.textContent === "Continue to video")!;
    expect(confirm).toBeDefined();
    confirm.click();
    await vi.waitFor(() => expect([...document.querySelectorAll("button")].some(button => button.textContent === "Checking this song…")).toBe(true));
    expect(document.querySelector("[data-song-choice-screen]")?.getAttribute("aria-hidden")).toBeNull();
    fixture.pendingChecks[0]!();
    await awaitPlan("ready");
    await vi.waitFor(() => expect(document.querySelector("[data-song-choice-screen]")?.getAttribute("aria-hidden")).toBe("true"));
  });

  test("a refused excerpt never opens capture", async () => {
    songSetup({ preflight: "refused", mobile: true });
    await loadSongMetadata();
    await awaitPlan("refused");
    expect(document.body.textContent).toContain("longer than the server allows");
    // The record control is present but inert: without a song nothing
    // starts, and the view says what is missing instead.
    document.querySelector<HTMLButtonElement>('button[aria-label="Start recording"]')?.click();
    expect(startCapture).not.toHaveBeenCalled();
    expect(previews).toHaveLength(0);
  });

  test("an accepted song opens capture without a second policy request", async () => {
    songSetup({ preflight: "accepted", mobile: true });
    await loadSongMetadata();
    await awaitPlan("ready");
    await vi.waitFor(() => expect(document.querySelector('button[aria-label="Start recording"]')).not.toBeNull());
    expect(document.body.textContent).not.toContain("couldn’t be checked for your profile");
    expect(document.body.textContent).not.toContain("Try the check again");
  });

  test("a profile bound to another community cannot start capture", async () => {
    songSetup({
      preflight: "accepted",
      mobile: true,
      personaOptions: [{ id: "persona", label: "Other profile", communityId: "other-community" }],
    });
    await loadSongMetadata();
    await awaitPlan("ready");
    expect(document.body.textContent).toContain("Choose a posting profile for this community.");
    document.querySelector<HTMLButtonElement>('button[aria-label="Start recording"]')?.click();
    expect(previews).toHaveLength(0);
    expect(startCapture).not.toHaveBeenCalled();
  });

  test("recording survives losing approval and can still be stopped", async () => {
    const guide = guideSpy();
    nextSession = () => fakeSession(() => {});
    songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guide.audio });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    // A take in progress keeps its stop control.
    await vi.waitFor(() => expect(document.querySelector('button[aria-label="Stop recording"]')).not.toBeNull());
    await stopRecording();
    await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
  });

  test("a guide prepared for a moved window never starts the take", async () => {
    const guide = guideSpy({ manual: true });
    nextSession = () => fakeSession(() => {});
    const fixture = songSetup({
      preflight: "accepted",
      mobile: true,
      clipDurationMs: 16_000,
      deferIntervalChecks: true,
      createGuideAudio: () => guide.audio,
    });
    await loadSongMetadata();
    await vi.waitFor(() => expect(fixture.pendingChecks.length).toBe(1), { timeout: 3_000 });
    fixture.pendingChecks[0]!();
    await awaitPlan("ready");
    await startRecording();
    // While the guide loads, the author moves to another window and that
    // window is accepted too; the prepared guide is for the old one.
    moveWindow(2_000);
    await vi.waitFor(() => expect(fixture.pendingChecks.length).toBe(2), { timeout: 3_000 });
    fixture.pendingChecks[1]!();
    await awaitPlan("ready");
    guide.release();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(startCapture).not.toHaveBeenCalled();
    expect(document.querySelector('button[aria-label="Stop recording"]')).toBeNull();
  });

  test("a stale preflight answer cannot approve a window that moved", async () => {
    const fixture = songSetup({ preflight: "accepted", clipDurationMs: 16_000, deferIntervalChecks: true });
    await loadSongMetadata();
    await vi.waitFor(() => expect(fixture.pendingChecks.length).toBe(1), { timeout: 3_000 });
    // The take is staged while the current window is accepted, then the
    // window moves and the old answer arrives late; it must not approve.
    fixture.pendingChecks[0]!();
    await awaitPlan("ready");
    await chooseFile();
    moveWindow(2_000);
    await vi.waitFor(() => expect(fixture.pendingChecks.length).toBe(2), { timeout: 3_000 });
    fixture.pendingChecks[0]!();
    await new Promise(resolve => setTimeout(resolve, 20));
    await publish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("still being checked"));
    expect(fixture.commands).toHaveLength(0);
    fixture.pendingChecks[1]!();
    await awaitPlan("ready");
    await publish();
    await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]));
    expect(fixture.commands[0]?.input.body).toMatchObject({ clip_start_samples: 2_000 * 48 });
  });

  test("a stop during guide startup is honored instead of dropped by the busy gate", async () => {
    const guide = guideSpy({ manual: true });
    let stopped = 0;
    nextSession = () => fakeSession(() => { stopped += 1; });
    songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guide.audio });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(guide.calls.play).toBe(1));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    try {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.waitFor(() => expect(stopped).toBe(1));
      guide.release();
      await vi.waitFor(() => expect(document.body.textContent).toContain("page was hidden"));
      await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
    } finally {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    }
  });

  test("a guide that starts too late ends the take and reports the delay", async () => {
    const timings: number[] = [];
    let stopped = 0;
    nextSession = () => fakeSession(() => { stopped += 1; });
    songSetup({
      preflight: "accepted", mobile: true,
      createGuideAudio: () => guideSpy({ startAfterMs: 800 }).audio,
      onGuideTiming: timing => timings.push(timing.startDelayMs),
    });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(stopped).toBe(1), { timeout: 3_000 });
    await vi.waitFor(() => expect(document.body.textContent).toContain("started too late"));
    expect(timings[0]).toBeGreaterThan(750);
  });

  test("a guide that never starts times out and cancels the take", async () => {
    let cancelled = 0;
    nextSession = () => ({
      // SAFETY: the viewfinder preview is not exercised; jsdom has no MediaStream.
      stream: Object.create(null) as MediaStream,
      captureOriginMs: performance.now(),
      stop: async () => new File(["take"], "take.mp4", { type: "video/mp4" }),
      cancel: async () => { cancelled += 1; },
    });
    songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guideSpy({ stalls: true }).audio });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(document.body.textContent).toContain("guide song would not play"), { timeout: 3_000 });
    expect(cancelled).toBe(1);
  });

  test("a brief waiting event does not discard a guide that keeps playing", async () => {
    const guide = guideSpy();
    let stopped = 0;
    nextSession = () => fakeSession(() => { stopped += 1; });
    songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guide.audio });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(guide.calls.play).toBe(1));
    guide.events.get("waiting")?.();
    guide.audio.currentTime += 0.08;
    await new Promise(resolve => setTimeout(resolve, 120));
    expect(stopped).toBe(0);
    expect(document.querySelector('button[aria-label="Stop recording"]')).not.toBeNull();
  });

  test("a real guide gap discards the take and offers a retake in the camera", async () => {
    const guide = guideSpy();
    let stopped = 0;
    let cancelled = 0;
    nextSession = () => ({
      ...fakeSession(() => { stopped += 1; }),
      cancel: async () => { cancelled += 1; },
    });
    songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guide.audio });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(guide.calls.play).toBe(1));
    guide.events.get("waiting")?.();
    await vi.waitFor(() => expect(cancelled).toBe(1));
    expect(stopped).toBe(0);
    expect(document.querySelector("textarea")).toBeNull();
    const viewfinder = document.querySelector("[data-video-viewfinder]");
    expect(viewfinder?.textContent).toContain("The song stopped during recording");
    expect(document.body.textContent).not.toContain("The guide song stalled");
    const retake = [...document.querySelectorAll("button")].find(button => button.textContent === "Record again");
    expect(retake).toBeDefined();
    retake?.click();
    await vi.waitFor(() => expect(document.querySelector('button[aria-label="Start recording"]')).not.toBeNull());
  });

  test("a guide playback error cancels the take without a partial review", async () => {
    const guide = guideSpy();
    let stopped = 0;
    let cancelled = 0;
    nextSession = () => ({
      ...fakeSession(() => { stopped += 1; }),
      cancel: async () => { cancelled += 1; },
    });
    songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guide.audio });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(guide.calls.play).toBe(1));
    guide.events.get("error")?.();
    await vi.waitFor(() => expect(cancelled).toBe(1));
    expect(stopped).toBe(0);
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.querySelector("[data-video-viewfinder]")?.textContent).toContain("Record again");
  });

  test("a cold song is loaded before the camera starts, then the take plays it", async () => {
    const held = { end: 0 };
    const guide = guideSpy({ buffered: held });
    nextSession = () => fakeSession(() => undefined);
    songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guide.audio });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Loading the song"));
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(startCapture).not.toHaveBeenCalled();
    expect(guide.audio.preload).toBe("auto");
    held.end = 20;
    guide.events.get("progress")?.();
    await vi.waitFor(() => expect(startCapture).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(guide.calls.play).toBe(1));
  });

  test("a guide ready to play through starts the take before the whole excerpt is held", async () => {
    // What the Pixel does: about 7 s held, the download idled, HAVE_ENOUGH_DATA.
    const guide = guideSpy({ buffered: { end: 6.73 } });
    Object.defineProperty(guide.audio, "readyState", { value: 4 });
    nextSession = () => fakeSession(() => undefined);
    songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guide.audio });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(startCapture).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(guide.calls.play).toBe(1));
  });

  test("a song that fails to load never starts a take", async () => {
    const guide = guideSpy({ buffered: { end: 0 } });
    songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guide.audio });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(guide.events.get("error")).toBeDefined());
    guide.events.get("error")?.();
    await vi.waitFor(() => expect(document.body.textContent).toContain("didn't finish loading"));
    expect(startCapture).not.toHaveBeenCalled();
    expect(guide.calls.play).toBe(0);
  });

  test("a paused download mid-take does not end a take that is still playing", async () => {
    const guide = guideSpy({ buffered: { end: 210 } });
    let stopped = 0;
    nextSession = () => fakeSession(() => { stopped += 1; });
    songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guide.audio });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(guide.calls.play).toBe(1));
    // `stalled` only says the network paused; nothing listens for it.
    expect(guide.events.get("stalled")).toBeUndefined();
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(stopped).toBe(0);
    expect(document.body.textContent).toContain("Recording to A song");
  });

  test("a finalize answer lost after the server committed goes Home without a second finalize", async () => {
    let posted = 0;
    const fixture = songSetup({ preflight: "accepted", loseFinalize: "after_commit", onPosted: () => { posted += 1; } });
    await loadSongMetadata();
    await awaitPlan("ready");
    await chooseFile();
    await publish();
    await vi.waitFor(() => expect(posted).toBe(1));
    expect(fixture.commands.filter(command => command.kind === "finalize")).toHaveLength(1);
    expect(fixture.current()).toBeNull();
    expect(document.body.textContent).not.toContain("provider_unavailable");
    expect(document.body.textContent).not.toContain("hasn't finished uploading");
  });

  test("an unconfirmed finalize shows a checking state, then replays the same command", async () => {
    let posted = 0;
    const readFails = { value: false };
    const fixture = songSetup({ preflight: "accepted", loseFinalize: "before_commit", readFails, onPosted: () => { posted += 1; } });
    await loadSongMetadata();
    await awaitPlan("ready");
    await chooseFile();
    readFails.value = false;
    await publish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("couldn't confirm it arrived"));
    readFails.value = true;
    await vi.waitFor(() => expect(document.body.textContent).toContain("Checking that your video arrived"));
    expect(document.body.textContent).not.toContain("hasn't finished uploading");
    expect(posted).toBe(0);
    expect(fixture.current()?.pending?.command.kind).toBe("finalize");
    readFails.value = false;
    await vi.waitFor(() => expect(button("Try again")).toBeDefined());
    button("Try again")!.click();
    await vi.waitFor(() => expect(posted).toBe(1), { timeout: 5_000 });
    const finalizes = fixture.commands.filter(command => command.kind === "finalize");
    expect(finalizes).toHaveLength(2);
    expect(finalizes[1]?.input.body.idempotency_key).toBe(finalizes[0]?.input.body.idempotency_key);
  });

  test("the soundtrack controls are frozen while the take records", async () => {
    const guide = guideSpy({ manual: true });
    nextSession = () => fakeSession(() => undefined);
    songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guide.audio });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(guide.calls.play).toBe(1));
    const slider = document.querySelector<HTMLElement>('[role="slider"][aria-label="Where the song starts"]')!;
    const fieldset = slider.closest("fieldset");
    expect(fieldset?.hasAttribute("disabled")).toBe(true);
    expect(slider.hasAttribute("data-disabled")).toBe(true);
    guide.release();
    await stopRecording();
    await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
  });

  test("a take stopped early publishes with the song part it covers", async () => {
    const guide = guideSpy();
    nextSession = () => fakeSession(() => undefined);
    const fixture = songSetup({ preflight: "accepted", mobile: true, clipDurationMs: 8_000, createGuideAudio: () => guide.audio });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(guide.calls.play).toBe(1));
    await stopRecording();
    await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
    await vi.waitFor(() => expect(document.body.textContent).toContain("A song · 0:00 to 0:08"));
    await awaitPlan("ready");
    expect(document.body.textContent).not.toContain("recorded to a different part of the song");
    await publish();
    await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]));
    expect(fixture.commands[0]?.input.body).toMatchObject({
      intent: "song_reference", clip_start_samples: 0, clip_duration_samples: Math.floor(8_000 - 1_000 / 30) * 48,
    });
  });

  test("a take recorded to a different excerpt cannot publish with the song", async () => {
    const guide = guideSpy();
    nextSession = () => fakeSession(() => undefined);
    const fixture = songSetup({ preflight: "accepted", mobile: true, clipDurationMs: 16_000, createGuideAudio: () => guide.audio });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(guide.calls.play).toBe(1));
    await stopRecording();
    await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
    moveWindow(2_000);
    await awaitPlan("ready");
    await vi.waitFor(() => expect(document.body.textContent).toContain("recorded to a different part of the song"));
    await publish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("recorded to a different part of the song"));
    expect(fixture.commands).toHaveLength(0);
    // Every video references a song: there is no way to publish without it.
    expect(button("Use original sound")).toBeUndefined();
  });

  test("a guided take is aligned by the measured guide delay", async () => {
    let stopped = 0;
    nextSession = () => fakeSession(() => { stopped += 1; });
    const guide = guideSpy({ startAfterMs: 300 });
    const fixture = songSetup({
      preflight: "accepted", mobile: true,
      createGuideAudio: () => guide.audio,
    });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(guide.calls.resolved).toBe(1));
    await stopRecording();
    await vi.waitFor(() => expect(stopped).toBe(1));
    await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
    // The measured lead-in is what the take is trimmed by, so the first
    // published frame is the first frame after the guide started.
    expect(fixture.alignments).toHaveLength(1);
    expect(fixture.alignments[0]!.offsetMs).toBeGreaterThanOrEqual(250);
    expect(fixture.alignments[0]!.offsetMs).toBeLessThan(750);
    // The aligned artifact keeps the captured audio, so its container can
    // outlast the chosen-file bound; admission uses the guided bound.
    expect(fixture.inspectOptions.at(-1)?.maxDurationSeconds).toBe(GUIDED_TAKE_MAX_DURATION_SECONDS);
  });

  test("a take that cannot be aligned blocks publishing with the song", async () => {
    let stopped = 0;
    nextSession = () => fakeSession(() => { stopped += 1; });
    const guide = guideSpy();
    const fixture = songSetup({
      preflight: "accepted", mobile: true, clipDurationMs: 16_000,
      createGuideAudio: () => guide.audio,
      alignTake: async (file, offsetMs) => ({ file, trimmedMs: 0, requestedMs: offsetMs, aligned: false }),
    });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(guide.calls.resolved).toBe(1));
    await stopRecording();
    await vi.waitFor(() => expect(stopped).toBe(1));
    await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
    await vi.waitFor(() => expect(document.body.textContent).toContain("couldn’t be lined up with the song"));
    await publish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("couldn’t be lined up with the song"));
    expect(fixture.commands).toHaveLength(0);
    // Every video references a song: there is no way to publish without it.
    expect(button("Use original sound")).toBeUndefined();
  });

  test("publishing with the song uploads the aligned take", async () => {
    const original = new File(["original-take"], "take.mp4", { type: "video/mp4" });
    const aligned = new File(["aligned-take"], "take.mp4", { type: "video/mp4" });
    const guide = guideSpy();
    nextSession = () => ({
      // SAFETY: the viewfinder preview is not exercised; jsdom has no MediaStream.
      stream: Object.create(null) as MediaStream,
      captureOriginMs: performance.now(),
      stop: async () => original,
      cancel: async () => {},
    });
    const fixture = songSetup({
      preflight: "accepted", mobile: true, clipDurationMs: 16_000,
      createGuideAudio: () => guide.audio,
      alignTake: async (file, offsetMs) => ({ file: aligned, trimmedMs: offsetMs, requestedMs: offsetMs, aligned: true }),
    });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(guide.calls.resolved).toBe(1));
    await stopRecording();
    await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
    await publish();
    await vi.waitFor(() => expect(fixture.commands.map(command => command.kind)).toEqual(["reserve", "start", "finalize"]));
    expect(fixture.commands[0]?.input.body).toMatchObject({ intent: "song_reference", expected_size_bytes: aligned.size });
    expect(aligned.size).not.toBe(original.size);
  });

  test("a guided take stopped before its guide starts is unaligned and cannot publish with the song", async () => {
    const guide = guideSpy({ manual: true });
    const original = new File(["original-take"], "take.mp4", { type: "video/mp4" });
    nextSession = () => ({
      // SAFETY: the viewfinder preview is not exercised; jsdom has no MediaStream.
      stream: Object.create(null) as MediaStream,
      captureOriginMs: performance.now(),
      stop: async () => original,
      cancel: async () => {},
    });
    const fixture = songSetup({
      preflight: "accepted", mobile: true, clipDurationMs: 16_000,
      createGuideAudio: () => guide.audio,
    });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(guide.calls.play).toBe(1));
    // Stop before the guide's playback ever begins: the take was bound to the
    // guide at startup, so it must not become publishable with the song.
    await stopRecording();
    guide.release();
    await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
    await vi.waitFor(() => expect(document.body.textContent).toContain("couldn’t be lined up with the song"));
    await publish();
    await vi.waitFor(() => expect(document.body.textContent).toContain("couldn’t be lined up with the song"));
    expect(fixture.commands).toHaveLength(0);
    // Every video references a song: there is no way to publish without it.
    expect(button("Use original sound")).toBeUndefined();
  });

  test("the guide delay is measured from the capture origin, not from the session returning", async () => {
    const guide = guideSpy();
    // The encoder started 200 ms before the caller received the session, as it
    // does when setup continues after the encoder is running.
    nextSession = () => fakeSession(() => undefined, { captureOriginMs: performance.now() - 200 });
    const fixture = songSetup({
      preflight: "accepted", mobile: true, clipDurationMs: 16_000,
      createGuideAudio: () => guide.audio,
    });
    await loadSongMetadata();
    await awaitPlan("ready");
    await startRecording();
    await vi.waitFor(() => expect(guide.calls.resolved).toBe(1));
    await stopRecording();
    await vi.waitFor(() => expect(fixture.alignments).toHaveLength(1));
    expect(fixture.alignments[0]!.offsetMs).toBeGreaterThanOrEqual(150);
    expect(fixture.alignments[0]!.offsetMs).toBeLessThan(750);
  });

  describe("the chosen part of a song", () => {
    const startSlider = () => document.querySelector<HTMLElement>('[role="slider"][aria-label="Where the song starts"]');

    test("is not written anywhere a later session could read", async () => {
      songSetup({ preflight: "accepted" });
      await loadSongMetadata();
      await vi.waitFor(() => expect(plan()?.getAttribute("data-song-plan")).toBe("ready"), { timeout: 3_000 });
      moveWindow(2_000);
      // Past the debounce that keeps the selection while the composer is open.
      await new Promise(resolve => setTimeout(resolve, 600));
      expect(Object.keys(localStorage).filter(key => key.startsWith("song-excerpt-draft"))).toEqual([]);
    });

    test("starts fresh when the composer is opened again", async () => {
      songSetup({ preflight: "accepted" });
      await loadSongMetadata();
      await vi.waitFor(() => expect(plan()?.getAttribute("data-song-plan")).toBe("ready"), { timeout: 3_000 });
      moveWindow(2_000);
      await new Promise(resolve => setTimeout(resolve, 600));
      for (const dispose of disposers.splice(0)) dispose();
      document.body.replaceChildren();
      songSetup({ preflight: "accepted" });
      await loadSongMetadata();
      await vi.waitFor(() => expect(startSlider()?.getAttribute("aria-valuenow")).toBe("0"));
    });
  });

  describe("song sheet title and Continue", () => {
    const sheetTitle = () => soundtrackPanel()?.querySelector("h1")?.textContent;
    const continueControl = () => button("Continue to video");

    test("with no song chosen the sheet asks for one and Continue says why it waits", async () => {
      songSetup({ preflight: "accepted", initialSong: false });
      await vi.waitFor(() => expect(soundtrackPanel()).not.toBeNull());
      expect(sheetTitle()).toBe("Choose a song");
      expect(soundtrackPanel()!.getAttribute("aria-label")).toBe("Choose a song");
      expect(continueControl()!.disabled).toBe(true);
      expect(document.getElementById("song-continue-hint")?.textContent).toBe("Choose a song to continue.");
      expect(continueControl()!.getAttribute("aria-describedby")).toBe("song-continue-hint");
    });

    test("a preselected song is already chosen while it loads, so the sheet is about where it starts", async () => {
      songSetup({ preflight: "accepted", reader: "pending" });
      await vi.waitFor(() => expect(soundtrackPanel()!.textContent).toContain("Loading that song…"));
      expect(sheetTitle()).toBe("Choose the starting point");
      expect(soundtrackPanel()!.getAttribute("aria-label")).toBe("Choose the starting point");
      expect(continueControl()!.disabled).toBe(true);
      expect(document.getElementById("song-continue-hint")).toBeNull();
    });

    test("a loaded song is about where it starts, and says it is waiting for its length", async () => {
      songSetup({ preflight: "pending" });
      await vi.waitFor(() => expect(document.querySelector("audio")).not.toBeNull());
      // Loaded, length unknown: the sheet is about where it starts and says it is waiting.
      expect(sheetTitle()).toBe("Choose the starting point");
      expect(soundtrackPanel()!.textContent).toContain("Getting this song ready…");
      expect(continueControl()!.disabled).toBe(true);
      // The song is chosen, so the "no song" line does not apply.
      expect(document.getElementById("song-continue-hint")).toBeNull();
      await loadSongMetadata();
      await vi.waitFor(() => expect(soundtrackPanel()!.textContent).not.toContain("Getting this song ready…"));
      expect(sheetTitle()).toBe("Choose the starting point");
    });

    test("a song that fails to load keeps the sheet on choosing and says why once", async () => {
      songSetup({ preflight: "accepted", reader: "failed" });
      await vi.waitFor(() => expect(soundtrackPanel()!.textContent).toContain("couldn’t load"));
      expect(sheetTitle()).toBe("Choose a song");
      expect(continueControl()!.disabled).toBe(true);
      expect(document.getElementById("song-continue-hint")).toBeNull();
    });

    test("Continue enables when the chosen part of the song is accepted", async () => {
      songSetup({ preflight: "accepted" });
      await loadSongMetadata();
      await vi.waitFor(() => expect(plan()?.getAttribute("data-song-plan")).toBe("ready"), { timeout: 3_000 });
      expect(sheetTitle()).toBe("Choose the starting point");
      expect(continueControl()!.disabled).toBe(false);
      expect(document.getElementById("song-continue-hint")).toBeNull();
    });
  });

  describe("camera preview before recording", () => {
    const viewfinderStream = () => document.querySelector<HTMLVideoElement>("[data-video-viewfinder] video")?.srcObject;

    test("the camera waits for a song", async () => {
      songSetup({ preflight: "accepted", mobile: true, initialSong: false });
      await vi.waitFor(() => expect(document.querySelector('section[aria-label="Soundtrack"]')).not.toBeNull());
      await Promise.resolve();
      expect(openPreview).not.toHaveBeenCalled();
      // The record control is present but inert: without a song nothing
    // starts, and the view says what is missing instead.
    document.querySelector<HTMLButtonElement>('button[aria-label="Start recording"]')?.click();
    expect(startCapture).not.toHaveBeenCalled();
    });

    test("the camera shows on the capture screen before any take starts", async () => {
      songSetup({ preflight: "accepted", mobile: true });
      await loadSongMetadata();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(previews).toHaveLength(1));
      await vi.waitFor(() => expect(viewfinderStream()).toBe(previews[0]!.stream));
      expect(startCapture).not.toHaveBeenCalled();
      expect(document.querySelector('button[aria-label="Start recording"]')).not.toBeNull();
    });

    test("the viewfinder plays the live camera rather than relying on autoplay", async () => {
      const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
      songSetup({ preflight: "accepted", mobile: true });
      await loadSongMetadata();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(viewfinderStream()).toBe(previews[0]!.stream));
      const viewfinder = document.querySelector("[data-video-viewfinder] video");
      await vi.waitFor(() => expect(play.mock.contexts).toContain(viewfinder));
      expect(document.querySelector("[data-video-viewfinder-resume]")).toBeNull();
      play.mockRestore();
    });

    test("a refused viewfinder play shows a tap target that starts the camera", async () => {
      const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("NotAllowedError"));
      songSetup({ preflight: "accepted", mobile: true });
      await loadSongMetadata();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(viewfinderStream()).toBe(previews[0]!.stream));
      const resume = await vi.waitFor(() => {
        const button = document.querySelector<HTMLButtonElement>("[data-video-viewfinder-resume]");
        expect(button?.textContent).toContain("Tap to show the camera");
        return button!;
      });
      play.mockResolvedValue();
      resume.click();
      await vi.waitFor(() => expect(document.querySelector("[data-video-viewfinder-resume]")).toBeNull());
      play.mockRestore();
    });

    test("recording takes over the previewed camera instead of reopening it", async () => {
      nextSession = () => fakeSession(() => undefined);
      songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guideSpy().audio });
      await loadSongMetadata();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(previews).toHaveLength(1));
      await startRecording();
      await vi.waitFor(() => expect(startCapture).toHaveBeenCalledTimes(1));
      expect(startCapture.mock.calls[0]?.[0].stream).toBe(previews[0]!.stream);
      // The recording owns the tracks now; the runtime must not stop them.
      expect(previews[0]!.stopped()).toBe(false);
      expect(openPreview).toHaveBeenCalledTimes(1);
    });

    test("record waits for first-use camera permission rather than opening a second camera", async () => {
      let grantPreview: ((stream: MediaStream) => void) | undefined;
      const permission = new Promise<MediaStream>(resolve => { grantPreview = resolve; });
      openPreview.mockImplementationOnce(() => permission);
      nextSession = () => fakeSession(() => undefined);
      songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guideSpy().audio });
      await loadSongMetadata();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(openPreview).toHaveBeenCalledTimes(1));
      await startRecording();
      await Promise.resolve();
      expect(startCapture).not.toHaveBeenCalled();

      const track = { stop: vi.fn() };
      // SAFETY: the runtime only calls getTracks on this test stream; jsdom
      // has no MediaStream constructor to provide the same minimal object.
      const stream = Object.assign(Object.create(null) as MediaStream, { getTracks: () => [track] });
      grantPreview!(stream);
      await vi.waitFor(() => expect(startCapture).toHaveBeenCalledTimes(1));
      expect(startCapture.mock.calls[0]?.[0].stream).toBe(stream);
      expect(openPreview).toHaveBeenCalledTimes(1);
    });

    test("record stops when first-use camera permission is denied", async () => {
      const { VideoCaptureError } = await import("./capture");
      let denyPreview: ((error: Error) => void) | undefined;
      const permission = new Promise<MediaStream>((_resolve, reject) => { denyPreview = reject; });
      openPreview.mockImplementationOnce(() => permission);
      nextSession = () => fakeSession(() => undefined);
      songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guideSpy().audio });
      await loadSongMetadata();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(openPreview).toHaveBeenCalledTimes(1));
      await startRecording();
      await Promise.resolve();
      expect(startCapture).not.toHaveBeenCalled();

      if (!denyPreview) throw new Error("camera permission request was not started");
      denyPreview(new VideoCaptureError("camera_denied", "denied"));
      await vi.waitFor(() => expect(document.body.textContent).toContain("Camera unavailable"));
      expect(button("Choose a video instead")).not.toBeUndefined();
      expect(startCapture).not.toHaveBeenCalled();
      expect(openPreview).toHaveBeenCalledTimes(1);
    });

    test("a take abandoned because the excerpt moved during camera permission releases the granted camera", async () => {
      let grantPreview: ((stream: MediaStream) => void) | undefined;
      const permission = new Promise<MediaStream>(resolve => { grantPreview = resolve; });
      openPreview.mockImplementationOnce(() => permission);
      nextSession = () => fakeSession(() => undefined);
      const fixture = songSetup({
        preflight: "accepted",
        mobile: true,
        deferIntervalChecks: true,
        createGuideAudio: () => guideSpy().audio,
      });
      await loadSongMetadata();
      await vi.waitFor(() => expect(fixture.pendingChecks.length).toBe(1), { timeout: 3_000 });
      fixture.pendingChecks[0]!();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(openPreview).toHaveBeenCalledTimes(1));
      await startRecording();
      // The guide is ready at once, so Record is now waiting on the camera
      // request. Moving the window earlier would stop the take at the earlier
      // guide check, before any stream is taken, and prove nothing.
      await new Promise(resolve => setTimeout(resolve, 50));
      moveWindow(2_000);
      await vi.waitFor(() => expect(fixture.pendingChecks.length).toBe(2), { timeout: 3_000 });
      fixture.pendingChecks[1]!();
      await awaitPlan("ready");
      expect(startCapture).not.toHaveBeenCalled();

      const track = { stop: vi.fn() };
      // SAFETY: the runtime only calls getTracks on this test stream; jsdom
      // has no MediaStream constructor to provide the same minimal object.
      const stream = Object.assign(Object.create(null) as MediaStream, { getTracks: () => [track] });
      grantPreview!(stream);
      await new Promise(resolve => setTimeout(resolve, 50));
      // The new window is approved but the take was for the old one: it must
      // not start, and the camera Record took over must not stay on.
      expect(startCapture).not.toHaveBeenCalled();
      expect(track.stop).toHaveBeenCalled();
    });

    test("going back from review reopens the camera", async () => {
      nextSession = () => fakeSession(() => undefined);
      songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guideSpy().audio });
      await loadSongMetadata();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(previews).toHaveLength(1));
      await startRecording();
      await stopRecording();
      await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
      expect(previews).toHaveLength(1);
      document.querySelector<HTMLButtonElement>('button[aria-label="Back to capture"]')!.click();
      await vi.waitFor(() => expect(previews).toHaveLength(2));
      await vi.waitFor(() => expect(viewfinderStream()).toBe(previews[1]!.stream));
    });

    test("choosing a file instead releases the camera", async () => {
      songSetup({ preflight: "accepted", mobile: true });
      await loadSongMetadata();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(previews).toHaveLength(1));
      await chooseFile();
      expect(previews[0]!.stopped()).toBe(true);
      expect(previews).toHaveLength(1);
    });

    test("leaving the composer releases the camera", async () => {
      songSetup({ preflight: "accepted", mobile: true });
      await loadSongMetadata();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(previews).toHaveLength(1));
      for (const dispose of disposers.splice(0)) dispose();
      expect(previews[0]!.stopped()).toBe(true);
    });

    test("a denied camera says so and keeps upload available", async () => {
      const { VideoCaptureError } = await import("./capture");
      previewFailure = new VideoCaptureError("camera_denied", "denied");
      songSetup({ preflight: "accepted", mobile: true });
      await loadSongMetadata();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(document.body.textContent).toContain("Camera unavailable"));
      expect(button("Choose a video instead")).not.toBeUndefined();
      expect(startCapture).not.toHaveBeenCalled();
    });

    test("Try again after a denied camera asks for the camera again", async () => {
      const { VideoCaptureError } = await import("./capture");
      previewFailure = new VideoCaptureError("camera_denied", "denied");
      songSetup({ preflight: "accepted", mobile: true });
      await loadSongMetadata();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(document.body.textContent).toContain("Camera unavailable"));
      expect(openPreview).toHaveBeenCalledTimes(1);
      // The person allowed the camera in the browser's settings.
      previewFailure = undefined;
      button("Try again")!.click();
      await vi.waitFor(() => expect(previews).toHaveLength(1));
      await vi.waitFor(() => expect(document.querySelector('button[aria-label="Start recording"]')).not.toBeNull());
      expect(document.body.textContent).not.toContain("Camera unavailable");
    });

    test("a browser that cannot record says so plainly and offers only the upload", async () => {
      const { VideoCaptureError } = await import("./capture");
      previewFailure = new VideoCaptureError("capability_unavailable", "This browser can’t record video. Upload a video instead.");
      songSetup({ preflight: "accepted", mobile: true });
      await loadSongMetadata();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(document.body.textContent).toContain("Recording isn’t available here"));
      expect(button("Upload a video")).not.toBeUndefined();
      expect(button("Try again")).toBeUndefined();
      expect(document.body.textContent).not.toMatch(/H\.264|AAC|WebM/);
      // The panel says it once: the raw message is not repeated above it.
      expect(document.body.textContent!.match(/can’t record video/g)).toHaveLength(1);
    });

    test("a recording that fails after it started is a retryable stop, not an unsupported browser", async () => {
      const { VideoCaptureError } = await import("./capture");
      nextSession = () => fakeSession(() => undefined);
      songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guideSpy().audio });
      await loadSongMetadata();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(previews).toHaveLength(1));
      await startRecording();
      await vi.waitFor(() => expect(startCapture).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(document.querySelector('button[aria-label="Stop recording"]')).not.toBeNull());
      startCapture.mock.calls[0]![0].onFailure(new VideoCaptureError("encoder_failed", "Recording failed. Try again or upload a video."));
      await vi.waitFor(() => expect(document.body.textContent).toContain("Recording stopped"));
      expect(document.body.textContent).not.toContain("isn’t available here");
      // The panel says it; the raw message is not repeated above it.
      expect(document.body.textContent).not.toContain("Recording failed.");
      expect(document.querySelector("textarea")).toBeNull();
      button("Try again")!.click();
      await vi.waitFor(() => expect(document.querySelector('button[aria-label="Start recording"]')).not.toBeNull());
      expect(document.body.textContent).not.toContain("Recording stopped");
    });

    test("after Stop the capture screen says the take is being finished", async () => {
      let finish = () => {};
      const held = new Promise<void>(resolve => { finish = resolve; });
      nextSession = () => fakeSession(() => undefined);
      songSetup({
        preflight: "accepted", mobile: true, createGuideAudio: () => guideSpy().audio,
        alignTake: async (file, offsetMs) => {
          await held;
          return { file, trimmedMs: offsetMs, requestedMs: offsetMs, aligned: true };
        },
      });
      await loadSongMetadata();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(previews).toHaveLength(1));
      await startRecording();
      await vi.waitFor(() => expect(startCapture).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(document.querySelector('button[aria-label="Stop recording"]')).not.toBeNull());
      expect(document.body.textContent).not.toContain("Finishing your video");
      await stopRecording();
      await vi.waitFor(() => expect(document.body.textContent).toContain("Finishing your video…"));
      finish();
      await vi.waitFor(() => expect(document.querySelector("textarea")).not.toBeNull());
      expect(document.body.textContent).not.toContain("Finishing your video");
    });

    test("upload is not offered while a take is recording", async () => {
      nextSession = () => fakeSession(() => undefined);
      songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guideSpy().audio });
      await loadSongMetadata();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(previews).toHaveLength(1));
      expect(button("Upload")!.disabled).toBe(false);
      await startRecording();
      await vi.waitFor(() => expect(document.querySelector('button[aria-label="Stop recording"]')).not.toBeNull());
      expect(button("Upload")!.disabled).toBe(true);
    });

    function setVisibility(state: "hidden" | "visible") {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
      document.dispatchEvent(new Event("visibilitychange"));
    }

    test("a take interrupted by leaving the page is discarded and can never be uploaded", async () => {
      const { VideoCaptureError } = await import("./capture");
      let stopped = 0;
      nextSession = () => fakeSession(() => { stopped += 1; });
      const fixture = songSetup({ preflight: "accepted", mobile: true, createGuideAudio: () => guideSpy().audio });
      await loadSongMetadata();
      await awaitPlan("ready");
      await vi.waitFor(() => expect(previews).toHaveLength(1));
      await startRecording();
      await vi.waitFor(() => expect(startCapture).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(document.querySelector('button[aria-label="Stop recording"]')).not.toBeNull());
      // The capture module cancels the take and reports the interruption.
      startCapture.mock.calls[0]![0].onFailure(new VideoCaptureError("interrupted", "The recording stopped because you left the page. Record again."));
      await vi.waitFor(() => expect(document.body.textContent).toContain("you left the page"));
      // Back at the camera, ready to record again: not a failure screen, and
      // no review, file or upload exists for the cancelled take.
      await vi.waitFor(() => expect(document.querySelector('button[aria-label="Start recording"]')).not.toBeNull());
      expect(document.body.textContent).not.toContain("Recording is not supported here");
      expect(document.querySelector("textarea")).toBeNull();
      expect(button("Publish video")).toBeUndefined();
      expect(stopped).toBe(0);
      await vi.waitFor(() => expect(previews).toHaveLength(2));
      expect(fixture.commands).toHaveLength(0);
      expect(fixture.fetchImpl).not.toHaveBeenCalled();
    });

    test("the camera is released while the page is hidden and reopens when it returns", async () => {
      try {
        songSetup({ preflight: "accepted", mobile: true });
        await loadSongMetadata();
        await awaitPlan("ready");
        await vi.waitFor(() => expect(previews).toHaveLength(1));
        setVisibility("hidden");
        await vi.waitFor(() => expect(previews[0]!.stopped()).toBe(true));
        expect(previews).toHaveLength(1);
        setVisibility("visible");
        await vi.waitFor(() => expect(previews).toHaveLength(2));
        expect(previews[1]!.stopped()).toBe(false);
      } finally {
        Reflect.deleteProperty(document, "visibilityState");
      }
    });
  });
});
