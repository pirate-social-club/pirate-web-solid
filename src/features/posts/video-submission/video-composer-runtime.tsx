import { createEffect, createMemo, createSignal, onCleanup, Show, untrack } from "solid-js";
import { Button, FormNote, IconQueue } from "../../../design-system";
import { type ExcerptBounds, formatExcerptTime } from "../post-composer/song-excerpt";
import { SongExcerptComposer, type SoundtrackSelection } from "../post-composer/song-excerpt-composer";
import { createLocalExcerptDraftStore } from "../post-composer/song-excerpt-draft-store";
import type { SongSourceReader } from "../post-composer/song-excerpt-source";
import { OriginalVideoCaptureSurface, OriginalVideoReviewSurface } from "../post-composer/video-original-audio-surface";
import type { OriginalVideoCaptureInput, VideoCaptureSession } from "./capture";
import { captureStopAfterMs, clipFitMessage, fitClipToExcerpt, GUIDED_TAKE_MAX_DURATION_SECONDS, songLengthForClip } from "./clip-duration";
import type { VideoSnapshot } from "./contracts";
import { alignGuidedTake, type GuidedTakeAlignment } from "./guided-take-alignment";
import { canDiscardRejectedVideo, VideoCoordinator, type PendingVideo, type VideoStorage } from "./coordinator";
import { SongReviewPreview } from "./song-review-preview";
import { createBrowserVideoStorage } from "./storage";
import {
  createSongIntervalPreflight,
  selectionSpan,
  songReferenceInvalidText,
  songReservationRefusalText,
  type SongChoice,
  type SongIntervalPreflight,
  type SongPlanState,
} from "./song-reference";
import { createVideoTransport, type VideoTransport } from "./transport";

/** The guide audio for a recording. Injected so tests and stories can drive a
 * take without a decoder. */
export interface GuideAudio {
  currentTime: number;
  play: () => Promise<void>;
  pause: () => void;
  addEventListener: (type: "error" | "waiting" | "stalled" | "playing", listener: () => void) => void;
  removeEventListener: (type: "error" | "waiting" | "stalled" | "playing", listener: () => void) => void;
}

/** A guide that has not started within this window has lost the take's start
 * boundary; a longer wait would only record more video without the song. */
export const GUIDE_START_TIMEOUT_MS = 1_500;
/** How late the guide may start after the encoder is running before the take
 * is ended. The server places the song at video time zero, so this delay is
 * lip-sync offset; it cannot be corrected later. */
export const GUIDE_START_MAX_DELAY_MS = 750;

export function VideoComposerRuntime(props: {
  readonly principalId: string;
  readonly communityId: string;
  readonly personaId?: string;
  readonly onExit: () => void;
  readonly onRetainedPersona: (personaId: string | null, communityId?: string) => void;
  readonly onPublished?: () => void;
  readonly storage?: VideoStorage;
  readonly transport?: VideoTransport;
  readonly inspectFile?: (file: File, options?: { readonly maxDurationSeconds?: number }) => Promise<File>;
  readonly measureDuration?: (file: File) => Promise<number | null>;
  /** The capture entry point, injected so the guide path can be driven without
   * a camera or an encoder. The default is the real capture module. */
  readonly startCapture?: (input: OriginalVideoCaptureInput) => Promise<VideoCaptureSession>;
  /** Opens the live camera shown before recording starts. The default is the
   * real capture module. */
  readonly openPreview?: () => Promise<MediaStream>;
  /** Whether this device records with its camera rather than choosing a file.
   * Defaults to a coarse-pointer phone-width viewport. */
  readonly cameraCapture?: boolean;
  readonly createGuideAudio?: (url: string) => GuideAudio;
  /** The alignment step for a guided take, injected so it can be driven
   * without a decoder. The default trims the measured lead-in from the real
   * file. */
  readonly alignTake?: (file: File, offsetMs: number) => Promise<GuidedTakeAlignment>;
  /** Instrumentation for the guide's start boundary: the measured delay
   * between the encoder starting and the guide's playback beginning. It is
   * the offset the take is trimmed by, not a synchronization guarantee. */
  readonly onGuideTiming?: (timing: { readonly startDelayMs: number }) => void;
  /** Instrumentation for the applied compensation. */
  readonly onTakeAlignment?: (info: {
    readonly offsetMs: number;
    readonly trimmedMs: number;
    readonly aligned: boolean;
  }) => void;
  readonly fetchImpl?: typeof fetch;
  readonly songPreflight?: SongIntervalPreflight;
  readonly songReader?: SongSourceReader;
  /** Entering from a song post: the song is chosen before capture and the
   * recording plays it as a guide. */
  readonly initialSong?: { readonly postId: string };
}) {
  const [record, setRecord] = createSignal<PendingVideo | null>(null);
  const [file, setFile] = createSignal<File | null>(null);
  const [caption, setCaption] = createSignal("");
  const [rating, setRating] = createSignal<"general" | "adult_18">("general");
  const [preview, setPreview] = createSignal<string>();
  const [busy, setBusy] = createSignal(true);
  const [error, setError] = createSignal("");
  const [progress, setProgress] = createSignal("");
  const [captureStatus, setCaptureStatus] = createSignal<"idle" | "recording" | "camera_denied" | "capability_unavailable" | "orientation_lost">("idle");
  const [stream, setStream] = createSignal<MediaStream | null>(null);
  // The chosen excerpt and the audio that will replace the recording, both
  // reported by the excerpt composer. They survive the move from choosing to
  // recording to review because the composer stays mounted across those steps.
  const [selection, setSelection] = createSignal<SoundtrackSelection | null>(null);
  const [clipDurationMs, setClipDurationMs] = createSignal<number | null>(null);
  const [measuring, setMeasuring] = createSignal(false);
  // Finalizing a take is independent of the UI busy gate: a stop must be
  // honorable while the guide is still starting.
  const [finalizing, setFinalizing] = createSignal(false);
  const mobile = props.cameraCapture
    ?? (typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse) and (max-width: 767px)").matches);
  // One draft store per principal, built once. The excerpt is kept beside the
  // video draft rather than inside it: the video record is the coordinator's
  // and is governed by a submission contract this selection is not part of yet.
  const excerptStore = createLocalExcerptDraftStore(props.principalId);
  const songPreflight = props.songPreflight ?? createSongIntervalPreflight();
  // Where the retained excerpt stands with the server. That verdict is
  // separate from the author's soundtrack choice below: loading another song
  // resets the verdict, never the intent.
  const [songPlan, setSongPlan] = createSignal<SongPlanState>({ kind: "none" });
  // The author's soundtrack choice. Every video references a song (owner
  // ruling 2026-09-24), so once a song loads it stays the choice through
  // pending checks and song switches.
  const [songChoice, setSongChoice] = createSignal<SongChoice>({ kind: "none" });
  // Entering from a song post, the song is already chosen: its excerpt
  // controls stay folded behind the song pill unless the author opens them or
  // something about the song needs their decision.
  const [songPanelOpen, setSongPanelOpen] = createSignal(false);
  let songPanel: HTMLDivElement | undefined;
  /** Opens or closes the song controls, bringing them into view when opened. */
  const toggleSongPanel = () => {
    const opening = !songPanelOpen();
    setSongPanelOpen(opening);
    if (opening) queueMicrotask(() => songPanel?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
  };
  let picker: HTMLInputElement | undefined;
  let session: VideoCaptureSession | null = null;
  // The live camera shown before a take. Recording takes it over; anything
  // else that leaves the capture screen stops it.
  let previewStream: MediaStream | null = null;
  let previewOpening = false;
  let captureStarting = false;
  const stopTracks = (media: MediaStream | null) => { for (const track of media?.getTracks() ?? []) track.stop(); };
  function closePreview() {
    const open = previewStream;
    previewStream = null;
    stopTracks(open);
    if (open && stream() === open) setStream(null);
  }
  let guideAudio: GuideAudio | undefined;
  let disposed = false;
  let publishedId: string | undefined;
  const coordinator = new VideoCoordinator({
    principalId: props.principalId, storage: props.storage ?? createBrowserVideoStorage(props.principalId),
    transport: props.transport ?? createVideoTransport(), fetchImpl: props.fetchImpl,
    onChange: next => {
      if (disposed) return;
      setRecord(next); props.onRetainedPersona(next?.personaId ?? null, next?.communityId);
      if (next?.snapshot?.status === "published" && next.snapshot.published_resource.post_id !== publishedId) {
        publishedId = next.snapshot.published_resource.post_id; props.onPublished?.();
      }
    },
    onProgress: (sent, total) => { if (!disposed) setProgress(total > 0 ? `Uploading video… ${Math.floor((sent / total) * 100)}%` : "Uploading video…"); },
  });
  function showFile(next: File) {
    const previous = preview(); if (previous) URL.revokeObjectURL(previous);
    setFile(next); setPreview(URL.createObjectURL(next));
  }
  function showOriginalTake(next: File) {
    const previous = originalPreview(); if (previous) URL.revokeObjectURL(previous);
    setOriginalPreview(URL.createObjectURL(next));
  }
  function clearPreviewUrls() {
    const retained = preview(); if (retained) URL.revokeObjectURL(retained);
    const original = originalPreview(); if (original) URL.revokeObjectURL(original);
    setPreview(undefined); setOriginalPreview(undefined);
  }
  async function run<T>(action: () => Promise<T>): Promise<void> {
    if (busy() || disposed) return;
    setBusy(true); setError(""); setProgress("");
    try { await action(); } catch (failure) { if (!disposed) setError(failure instanceof Error ? failure.message : "The video attempt could not be completed safely"); }
    finally { if (!disposed) { setBusy(false); setProgress(""); } }
  }
  void coordinator.restore().then(next => {
    if (!next || disposed) return;
    showFile(next.file); setCaption(next.caption); setRating(next.rating);
  }).catch(failure => { if (!disposed) setError(failure instanceof Error ? failure.message : "Video restore failed"); })
    .finally(() => { if (!disposed) setBusy(false); });

  /** Whether a song has been chosen as the soundtrack. */
  const songActive = () => songChoice().kind !== "none";
  /** Every video uses a song, so the camera waits until one is chosen. */
  const songChosen = () => songActive() && selection() !== null;
  const songNeedsAttention = () => {
    const kind = songPlan().kind;
    return selection() === null
      || kind === "not_available" || kind === "timing_unavailable" || kind === "refused"
      || kind === "ineligible" || kind === "failed"
      // A take that cannot publish with the song needs the choice below it.
      || takeMismatch() || (takeSoundtrack() !== null && takeAlignment() === "unaligned") || clipProblem() !== undefined;
  };
  const songPanelVisible = () => !props.initialSong || songPanelOpen() || songNeedsAttention();
  const songLabel = () => {
    const current = selection();
    return songActive() && current ? `${current.title} · ${windowSpan(current.bounds)}` : undefined;
  };
  /** The length the clip must reach for the current excerpt. */
  const clipFit = createMemo(() => fitClipToExcerpt(clipDurationMs(), selection()?.bounds));
  const clipProblem = createMemo(() => {
    const fit = clipFit();
    return fit.kind === "too_short" || fit.kind === "too_long" ? clipFitMessage(fit) : undefined;
  });
  const clipNote = createMemo(() => {
    const fit = clipFit();
    return fit.kind === "trims" ? clipFitMessage(fit) : undefined;
  });
  /** The server's approval, but only while it names exactly what is on screen
   * now. A plan for a moved window, a different song or a stale revision is
   * not an approval to publish with; the composer invalidates it on change,
   * and this is the second check at the moment of publication. */
  const approvedSelection = createMemo(() => {
    const plan = songPlan();
    const current = selection();
    if (plan.kind !== "ready" || !current) return undefined;
    if (plan.selection.songPostId !== current.songPostId) return undefined;
    if (plan.selection.clipStartSamples !== current.bounds.startMs * 48) return undefined;
    if (plan.selection.clipDurationSamples !== (current.bounds.endMs - current.bounds.startMs) * 48) {
      return undefined;
    }
    return plan.selection;
  });
  /** The excerpt a guided take was recorded to, when one was. A take danced to
   * one window cannot be published against another. */
  const [takeSoundtrack, setTakeSoundtrack] = createSignal<{ readonly songPostId: string; readonly bounds: ExcerptBounds } | null>(null);
  /** Whether the guided take was trimmed to the guide's start. An unaligned
   * take must not be published with the song: the motion would be ahead of
   * the music by the measured delay. */
  const [takeAlignment, setTakeAlignment] = createSignal<"none" | "aligned" | "unaligned">("none");
  // The untouched take's preview, kept beside the aligned one for review
  // when the take could not be aligned to the song.
  const [originalPreview, setOriginalPreview] = createSignal<string>();
  let guideStartDelayMs = 0;
  // Whether the guide actually began, and whether it began too late to
  // compensate. A guided take that was interrupted before its guide started
  // is never publishable with the song.
  let guideStarted = false;
  let guideStartExceeded = false;
  const takeMismatch = createMemo(() => {
    const take = takeSoundtrack();
    const current = selection();
    if (!take || !current) return false;
    // A take shortens the song part from the same start, so a shorter window
    // still matches; a moved start or a longer window does not.
    return take.songPostId !== current.songPostId
      || take.bounds.startMs !== current.bounds.startMs
      || current.bounds.endMs > take.bounds.endMs;
  });

  // Whether the guide has actually begun. A `waiting` before the first
  // `playing` is startup buffering, not a mid-take stall, and ending the take
  // for it would cancel every recording on a slow network.
  let guidePlaying = false;
  const onGuidePlaying = () => { guidePlaying = true; };
  const stopGuide = () => {
    const audio = guideAudio;
    guideAudio = undefined;
    guidePlaying = false;
    if (!audio) return;
    audio.removeEventListener("error", onGuideFailure);
    audio.removeEventListener("waiting", onGuideInterrupted);
    audio.removeEventListener("stalled", onGuideInterrupted);
    audio.removeEventListener("playing", onGuidePlaying);
    audio.pause();
  };
  const onGuideFailure = () => {
    if (disposed) return;
    void stopCapture("The guide song stopped unexpectedly, so the recording ended.");
  };
  /** Buffering mid-take means the guide is no longer keeping time with the
   * recording; the take ends rather than drifting silently. */
  const onGuideInterrupted = () => {
    if (disposed || !guidePlaying) return;
    void stopCapture("The guide song stalled, so this recording ended.");
  };
  async function startGuide(guide: SoundtrackSelection): Promise<boolean> {
    stopGuide();
    const audio = props.createGuideAudio ? props.createGuideAudio(guide.audioUrl) : new Audio(guide.audioUrl);
    guideAudio = audio;
    audio.addEventListener("error", onGuideFailure);
    audio.addEventListener("waiting", onGuideInterrupted);
    audio.addEventListener("stalled", onGuideInterrupted);
    audio.addEventListener("playing", onGuidePlaying);
    audio.currentTime = guide.bounds.startMs / 1_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // A stalled playback start must not hold the take open forever.
      const started = await Promise.race([
        audio.play().then(() => true),
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), GUIDE_START_TIMEOUT_MS);
        }),
      ]);
      if (!started) stopGuide();
      return started;
    } catch {
      stopGuide();
      return false;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async function measureClip(next: File) {
    if (!selection()) { setClipDurationMs(null); return; }
    setMeasuring(true);
    try {
      const duration = props.measureDuration
        ? await props.measureDuration(next)
        : await (await import("./capture")).measureVideoDuration(next);
      if (!disposed) setClipDurationMs(duration);
    } finally {
      if (!disposed) setMeasuring(false);
    }
  }

  async function chooseFile(next: File | undefined) {
    if (!next || record()) return;
    await run(async () => {
      await session?.cancel(); session = null; closePreview(); setStream(null); setCaptureStatus("idle");
      stopGuide();
      setTakeSoundtrack(null);
      setTakeAlignment("none");
      guideStartDelayMs = 0;
      guideStarted = false;
      guideStartExceeded = false;
      const original = originalPreview(); if (original) URL.revokeObjectURL(original);
      setOriginalPreview(undefined);
      const accepted = props.inspectFile ? await props.inspectFile(next) : await (await import("./capture")).inspectVideoFile(next);
      if (disposed) return;
      showFile(accepted);
      await measureClip(accepted);
    });
  }
  /** Stops the take without the UI busy gate. A limit, a backgrounding or a
   * guide failure must be honorable while `toggleCapture` is still awaiting
   * the guide's playback start, and `run` would drop such a request. */
  async function stopCapture(reason?: string) {
    const current = session;
    if (!current) { if (reason && !disposed) setError(reason); return; }
    session = null;
    stopGuide();
    setFinalizing(true);
    try {
      const take = await current.stop();
      let finalTake = take;
      if (takeSoundtrack()) {
        if (!guideStarted || guideStartExceeded) {
          // The take was bound to a guide that never began, or began too late
          // to compensate. It stays reviewable with its own sound but cannot
          // be published against the song.
          finalTake = take;
          if (!disposed) setTakeAlignment("unaligned");
          props.onTakeAlignment?.({ offsetMs: guideStartDelayMs, trimmedMs: 0, aligned: false });
        } else {
          const alignment = await (props.alignTake ?? alignGuidedTake)(take, guideStartDelayMs);
          let aligned = alignment.aligned;
          let candidate = alignment.file;
          if (aligned) {
            // The transformed bytes go through the same admission the server
            // probe applies. A conversion that dropped the audio track or the
            // codecs is not publishable, whatever the conversion reported.
            try {
              const inspect = props.inspectFile ?? (await import("./capture")).inspectVideoFile;
              // The aligned artifact keeps the captured audio, so its container
              // can outlast the chosen-file bound; the guided bound applies.
              await inspect(candidate, { maxDurationSeconds: GUIDED_TAKE_MAX_DURATION_SECONDS });
            } catch {
              aligned = false;
              candidate = take;
            }
          }
          finalTake = candidate;
          if (!disposed) setTakeAlignment(aligned ? "aligned" : "unaligned");
          props.onTakeAlignment?.({ offsetMs: guideStartDelayMs, trimmedMs: aligned ? alignment.trimmedMs : 0, aligned });
        }
      } else {
        if (!disposed) setTakeAlignment("none");
      }
      if (!disposed) { showOriginalTake(take); showFile(finalTake); await measureClip(finalTake); }
    } catch (failure) {
      if (!disposed) setError(failure instanceof Error ? failure.message : "The recording could not be finalized");
    } finally {
      if (!disposed) { setFinalizing(false); setStream(null); setCaptureStatus("idle"); }
    }
    // The stop is what ends the take; the reason goes up after it so the
    // finalization cannot clear it.
    if (reason && !disposed) setError(reason);
  }
  async function toggleCapture() {
    if (session) { await stopCapture(); return; }
    await run(async () => {
      const startCapture = props.startCapture
        ?? (async (input: OriginalVideoCaptureInput) => (await import("./capture")).startOriginalVideoCapture(input));
      const capture = await import("./capture");
      const guide = songActive() ? selection() : null;
      try {
        setTakeAlignment("none");
      guideStartDelayMs = 0;
      guideStarted = false;
      guideStartExceeded = false;
      // The guided intent is recorded before the asynchronous startup, so an
      // early stop or an over-limit start cannot finalize an unclassified
      // take. A take recorded to a guide is bound to it from this moment.
      if (guide) setTakeSoundtrack({ songPostId: guide.songPostId, bounds: guide.bounds });
      else setTakeSoundtrack(null);
      // The live preview becomes the recording's stream, so the take starts
      // from the picture already on screen instead of reopening the camera.
      const handed = previewStream;
      previewStream = null;
      let current: VideoCaptureSession;
      captureStarting = true;
      try {
        current = await startCapture({
          onFailure: failure => {
            session = null; stopGuide();
            if (disposed) return;
            setStream(null); setError(failure.message);
            // An interrupted take was cancelled, not saved: the author is
            // back at the camera and can simply record again.
            setCaptureStatus(failure.reason === "orientation_lost" ? "orientation_lost"
              : failure.reason === "interrupted" ? "idle" : "capability_unavailable");
          },
          onLimit: () => { void stopCapture(); },
          ...(guide ? { limitMs: captureStopAfterMs(guide.bounds) } : {}),
          ...(handed ? { stream: handed } : {}),
        });
      } catch (failure) {
        stopTracks(handed);
        if (handed && stream() === handed) setStream(null);
        throw failure;
      } finally {
        captureStarting = false;
      }
        if (disposed) { await current.cancel(); return; }
        session = current; setStream(current.stream); setCaptureStatus("recording");
        if (!guide) return;
        const started = await startGuide(guide);
        // Measured from the encoder's own origin to the moment playback
        // began, not from the moment the session object was returned: setup
        // time after the encoder started is part of the recorded lead-in,
        // and time before it is not.
        const startDelayMs = Math.max(0, Math.round(performance.now() - current.captureOriginMs));
        guideStartDelayMs = startDelayMs;
        props.onGuideTiming?.({ startDelayMs });
        // A stop may have been honored while the guide was still starting.
        if (session !== current) return;
        if (!started) {
          session = null; setStream(null); setCaptureStatus("idle");
          await current.cancel().catch(() => {});
          throw new Error("The guide song would not play, so this recording did not start. Check your sound settings and try again.");
        }
        guideStarted = true;
        if (startDelayMs > GUIDE_START_MAX_DELAY_MS) {
          guideStartExceeded = true;
          await stopCapture("The guide song started too late to align this take, so it was ended. Record again.");
          return;
        }
      } catch (failure) {
        if (failure instanceof capture.VideoCaptureError) { setCaptureStatus(failure.reason === "camera_denied" ? "camera_denied" : "capability_unavailable"); }
        throw failure;
      }
    });
  }
  // A hidden page is where browser media playback is suspended without an
  // event. The guide then can no longer keep time with the recording, so the
  // take ends there rather than silently drifting. An unguided take is
  // cancelled by the capture module instead, because its picture freezes.
  const interactionBusy = () => busy() || finalizing();
  // The camera preview is held only while the page is visible.
  const [pageVisible, setPageVisible] = createSignal(typeof document === "undefined" || document.visibilityState !== "hidden");
  const onVisibilityChange = () => {
    setPageVisible(document.visibilityState !== "hidden");
    if (document.visibilityState !== "hidden" || !session || !guideAudio) return;
    void stopCapture("The page was hidden, so the guide song stopped and this recording ended.");
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);

  async function publish() {
    await run(async () => {
      const retained = coordinator.current;
      if (retained && (retained.communityId !== props.communityId || retained.personaId !== props.personaId)) throw new Error("Resolve this retained video with its original community and persona");
      if (!retained) {
        const selected = file(); if (!selected || !props.personaId || !props.communityId) throw new Error("Choose a community, persona and compatible video");
        const plan = songPlan();
        // Every video references a song. Publishing waits for a chosen song
        // and the server's acceptance of its excerpt.
        if (songChoice().kind === "none") throw new Error("Choose a song for this video.");
        if (plan.kind === "checking") throw new Error("The excerpt is still being checked. Publish again once it has an answer.");
        // A song switch leaves the plan without a verdict; only the excerpt
        // on screen, accepted by the server, can be published.
        const approved = approvedSelection();
        if (approved === undefined) throw new Error("This excerpt hasn’t been accepted yet. Check it again or choose another part of the song.");
        // A clip shorter than the excerpt cannot be rendered with it; the
        // server would refuse it after upload for a reason this surface can
        // state now, and a retry of the same bytes cannot change that.
        const impossible = clipProblem();
        if (impossible) throw new Error(impossible);
        // A guided take was danced to one window; publishing it against
        // another would show the author performing to a song that is not the
        // one being rendered.
        if (takeMismatch()) throw new Error("This take was recorded to a different excerpt. Record again with the current excerpt.");
        // An unaligned take would publish with its motion ahead of the music.
        if (takeSoundtrack() && takeAlignment() === "unaligned") {
          throw new Error("This take could not be aligned to the song. Record it again.");
        }
        await coordinator.begin({
          communityId: props.communityId, personaId: props.personaId, file: selected,
          caption: caption(), rating: rating(), song: approved,
        });
      }
      if (disposed) return;
      await coordinator.submit();
    });
  }
  let backgroundRefresh: Promise<VideoSnapshot | null> | null = null;
  const poll = setInterval(() => {
    const state = record()?.snapshot;
    if ((state?.status === "manual_review" || (state?.status === "processing" && state.phase !== "awaiting_upload"))
      && !busy() && !backgroundRefresh) {
      // A passive read must not flash the action button every three seconds.
      backgroundRefresh = coordinator.refresh();
      void backgroundRefresh.catch(() => null).finally(() => { backgroundRefresh = null; });
    }
  }, 3_000);
  onCleanup(() => {
    disposed = true; clearInterval(poll); coordinator.pauseUpload();
    stopGuide();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
    void session?.cancel(); session = null;
    closePreview();
    clearPreviewUrls();
  });
  // The viewfinder follows the stream after each commit. A ref alone reads the
  // value from before the write that mounted it, which left the camera blank.
  let viewfinder: HTMLVideoElement | undefined;
  // `autoplay` alone left the Pixel's viewfinder paused on its first frame, so
  // the author saw no live picture while recording. Play explicitly; it is
  // muted, so the browser allows it.
  const showLive = (element: HTMLVideoElement, media: MediaStream | null) => {
    if (element.srcObject !== media) element.srcObject = media;
    if (media && element.paused) void element.play()?.catch(() => {});
  };
  createEffect(() => stream(), media => {
    if (viewfinder && viewfinder.isConnected) showLive(viewfinder, media);
  });
  // The camera opens when the capture screen shows, once a song is chosen,
  // not when recording starts: the author frames the shot first. It closes when the screen goes
  // away and reopens after a retake.
  createEffect(() => mobile && songChosen() && pageVisible() && !record() && !file() && captureStatus() === "idle" && !finalizing(), capturing => {
    if (!capturing) {
      // The camera stops now; the viewfinder signal is cleared outside the
      // effect's owned scope.
      const open = session ? null : previewStream;
      if (open) {
        previewStream = null;
        stopTracks(open);
        queueMicrotask(() => { if (!disposed && stream() === open) setStream(null); });
      }
      return;
    }
    if (session || captureStarting || previewStream || previewOpening) return;
    previewOpening = true;
    const open = props.openPreview ?? (async () => (await import("./capture")).openCameraPreview());
    // Opened outside the effect's owned scope: the camera callbacks write
    // signals, which Solid refuses inside it.
    queueMicrotask(() => {
      if (disposed) { previewOpening = false; return; }
      void open().then(media => {
        previewOpening = false;
        const stillCapturing = !disposed && !session && !captureStarting && !record() && !file()
          && captureStatus() === "idle" && document.visibilityState !== "hidden";
        if (!stillCapturing || previewStream) { stopTracks(media); return; }
        previewStream = media;
        setStream(media);
      }, async failure => {
        previewOpening = false;
        if (disposed) return;
        const capture = await import("./capture");
        setCaptureStatus(failure instanceof capture.VideoCaptureError && failure.reason === "camera_denied"
          ? "camera_denied"
          : "capability_unavailable");
      });
    });
  });
  const state = () => record()?.snapshot;
  const failure = () => { const snapshot = state(); return snapshot?.status === "processing_failed" ? snapshot : undefined; };
  const editing = () => !record();
  const awaiting = () => { const snapshot = state(); return snapshot?.status === "processing" && snapshot.phase === "awaiting_upload"; };
  const publishedHref = () => {
    const snapshot = state(); if (snapshot?.status !== "published") return undefined;
    const url = new URL(snapshot.published_resource.href, location.origin);
    return url.origin === location.origin ? `${url.pathname}${url.search}` : undefined;
  };
  const blocked = () => { const snapshot = state(); return snapshot?.status === "blocked" ? snapshot : undefined; };
  // One plain sentence for the submitted video. Raw server states never
  // reach the screen; while an action runs, only real upload progress shows.
  const videoStatusText = () => {
    const current = record(); if (!current || current.rejection) return undefined;
    const snapshot = state();
    if (!snapshot || (snapshot.status === "processing" && snapshot.phase === "awaiting_upload"))
      return busy() ? undefined : "Your video hasn't finished uploading.";
    if (snapshot.status === "processing") return "Your video is processing. This can take a few minutes.";
    if (snapshot.status === "processing_failed") return "Video processing failed.";
    if (snapshot.status === "blocked") return "This video can't be published.";
    if (snapshot.status === "abandoned") return "This video was cancelled.";
    if (snapshot.status === "published") return "Your video is posted.";
    return undefined;
  };
  const songReserved = () => { const reservation = record()?.reservation; return reservation?.intent === "song_reference" ? reservation : undefined; };
  return <section class="grid gap-3" aria-label="Video composer">
    <input ref={element => { picker = element; }} hidden type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={event => { void chooseFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
    <Show when={error()}>{message => <FormNote tone="warning">{message()}</FormNote>}</Show>
    <Show when={busy() && progress()}><p role="status">{progress()}</p></Show>
    <Show when={editing()}>
      {/* The soundtrack step comes first, always. Its window is the length of
          the recording, so choosing it before capture is what lets the guide
          play and the take stop with the excerpt. */}
      <div ref={element => { songPanel = element; }} hidden={!songPanelVisible()} class="grid gap-3">
      <fieldset class="contents" disabled={captureStatus() === "recording" || finalizing()}>
      <section aria-label="Soundtrack">
        <SongExcerptComposer store={excerptStore} read={props.songReader} communityId={props.communityId}
          disabled={captureStatus() === "recording" || finalizing()}
          onClose={props.onExit}
          clipLengthMs={songLengthForClip(clipDurationMs())}
          preflight={songPreflight} initialSong={props.initialSong}
          onPlan={setSongPlan}
          onChoice={choice => { if (!disposed) setSongChoice(choice); }}
          onSelection={next => {
            if (disposed) return;
            const hadSelection = selection() !== null;
            setSelection(next);
            // A clip chosen before the song is measured now, so the duration
            // guard applies whether the song came first or second.
            const current = file();
            if (next && current && !hadSelection) void measureClip(current);
          }} />
      </section>
      </fieldset>
      <Show when={props.initialSong && songPanelOpen() && !songNeedsAttention()}>
        <Button variant="secondary" onClick={() => setSongPanelOpen(false)}>Done</Button>
      </Show>
      </div>
      <Show when={!file() && songChosen()}>
        <div inert={interactionBusy()}>
          <Show when={captureStatus() === "recording"}>
            <p role="status" class="sr-only">{selection()
              ? `Recording to ${selection()!.title}. The take ends with the excerpt.`
              : "Recording. The take ends at the platform limit."}</p>
          </Show>
          <OriginalVideoCaptureSurface channel={mobile ? "camera" : "upload"} status={captureStatus()}
            songLabel={songLabel()} onSongTap={props.initialSong ? toggleSongPanel : undefined}
            onClose={props.onExit} onUpload={() => picker?.click()} onRecordToggle={() => { void toggleCapture(); }}
            onRetake={() => { setError(""); setCaptureStatus("idle"); }}
            preview={<video ref={element => { viewfinder = element; showLive(element, untrack(stream)); }} autoplay muted playsinline
              class={stream() ? "h-full w-full object-cover" : "hidden"} />} />
        </div>
      </Show>
    </Show>
    <Show when={editing() && file()}>
      <OriginalVideoReviewSurface caption={caption()} onCaptionChange={setCaption} submitting={busy()} onPublish={() => { void publish(); }}
        onBack={() => { if (!busy()) { setFile(null); setClipDurationMs(null); clearPreviewUrls(); } }}
        preview={songActive() && songPlan().kind === "ready" && selection() && takeAlignment() !== "unaligned"
          ? <SongReviewPreview audioUrl={selection()!.audioUrl} bounds={selection()!.bounds} videoUrl={preview()}
              createAudio={props.createGuideAudio} />
          : <video src={originalPreview() ?? preview()} controls playsinline class="h-full w-full object-contain" />}
        songLabel={songLabel()} onSongTap={props.initialSong ? toggleSongPanel : undefined}
        details={<div class="grid gap-3">
        <label><input type="checkbox" checked={rating() === "adult_18"} disabled={busy()} onChange={event => setRating(event.currentTarget.checked ? "adult_18" : "general")} /> This video is for adults (18+)</label>
        <Show when={clipProblem()}>
          {(problem) => <FormNote tone="warning">{problem()}</FormNote>}
        </Show>
        <Show when={clipNote()}>
          {(note) => <FormNote tone="muted">{note()}</FormNote>}
        </Show>
        <Show when={measuring()}>
          <p role="status">Measuring the clip against the excerpt…</p>
        </Show>
        <Show when={takeMismatch()}>
          <FormNote tone="warning">This take was recorded to a different part of the song. Record again with the current excerpt.</FormNote>
        </Show>
        <Show when={takeSoundtrack() && takeAlignment() === "unaligned"}>
          <FormNote tone="warning">This take couldn’t be lined up with the song. Record it again.</FormNote>
        </Show>
        <Show when={finalizing()}>
          <p role="status">Aligning the take with the song…</p>
        </Show>
        </div>} />
    </Show>
    <Show when={record()}>
      <Show when={videoStatusText()}>{text => <p role="status">{text()}</p>}</Show>
      <Show when={record()?.song && !record()?.rejection && state()?.status !== "manual_review"}>
        <p role="status">{songReserved()
          ? `Soundtrack: this song from ${selectionSpan(record()!.song!)}.`
          : "Adding the song to your video…"}</p>
      </Show>
      <Show when={record()?.rejection}>
        <p role="alert">{songReservationRefusalText(record()?.rejection?.reasonCode)
          ?? "This video wasn’t accepted."}</p>
        <Show when={canDiscardRejectedVideo(record())}><Button disabled={busy()} onClick={() => { void run(async () => {
          const rejected = await coordinator.discardRejected(); showFile(rejected.file); setCaption(rejected.caption); setRating(rejected.rating);
        }); }}>Edit rejected video</Button></Show>
      </Show>
      {/* One set of actions for the state that is actually on screen: an
          active upload, a retryable failure, a review hold, a terminal
          outcome. No state shows every recovery command at once. */}
      <Show when={!record()?.rejection && (state()?.status === "processing" || state() === undefined)}>
        <Show when={awaiting()}>
          <Show when={Date.parse(record()?.reservation?.upload.expires_at ?? "") <= Date.now()}>
            <p role="status">This upload reservation has expired. Cancel this submission, then select the source again for a new video.</p>
          </Show>
          <Button disabled={busy()} onClick={() => { void run(() => coordinator.revisionCommand("cancel")); }}>Cancel video submission</Button>
        </Show>
        <Show when={record()?.pending || awaiting() || !state()}><Button disabled={busy()} onClick={() => { void publish(); }}>Resume video submission</Button></Show>
        <Show when={busy()}><Button onClick={() => coordinator.pauseUpload()}>Pause upload</Button></Show>
        <Button disabled={busy()} onClick={() => { void run(() => coordinator.refresh()); }}>Check video status</Button>
      </Show>
      <Show when={!record()?.rejection && failure()}>
        <Show when={failure()?.reason_code === "provider_submission_unconfirmed"}>
          <p role="status">The provider submission is unconfirmed. It cannot be retried safely. You may keep it for reconciliation or abandon this attempt.</p>
          <Button disabled={busy()} onClick={() => { void run(() => coordinator.revisionCommand("cancel")); }}>Abandon unresolved video</Button>
        </Show>
        <Show when={failure()?.reason_code === "membership_required"}><p role="status">Restore your community posting eligibility, then retry publication. Your completed analysis is retained.</p></Show>
        <Show when={failure()?.retryable}><Button disabled={busy()} onClick={() => { void run(() => coordinator.revisionCommand("retry")); }}>{failure()?.reason_code === "membership_required" ? "Retry publication" : "Retry processing"}</Button></Show>
        <Show when={!failure()?.retryable && failure()?.reason_code !== "provider_submission_unconfirmed"}>
          <Button disabled={busy()} onClick={() => { void run(async () => { await coordinator.discard(); setFile(null); clearPreviewUrls(); setCaption(""); }); }}>Start a new video</Button>
        </Show>
        <Button disabled={busy()} onClick={() => { void run(() => coordinator.refresh()); }}>Check video status</Button>
      </Show>
      <Show when={!record()?.rejection && state()?.status === "manual_review"}>
        <div class="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col items-center justify-center gap-5 px-6 text-center" role="status">
          <span class="grid size-16 place-items-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
            <IconQueue class="size-8" />
          </span>
          <div class="space-y-2">
            <h2 class="text-xl font-semibold">Waiting for review</h2>
            <p class="text-sm text-muted-foreground">A community moderator must approve this video before it can be posted. It stays private until then.</p>
          </div>
          <Button class="w-full" onClick={props.onExit}>Done</Button>
        </div>
      </Show>
      <Show when={!record()?.rejection && (state()?.status === "blocked" || state()?.status === "abandoned")}>
        <Show when={blocked()?.reason_code === "song_reference_invalid"}><p role="status">{songReferenceInvalidText(blocked()?.song_reason_code)}</p></Show>
        <Button disabled={busy()} onClick={() => { void run(() => coordinator.refresh()); }}>Check video status</Button>
        <Button disabled={busy()} onClick={() => { void run(async () => { await coordinator.discard(); setFile(null); clearPreviewUrls(); setCaption(""); }); }}>Start a new video</Button>
      </Show>
      <Show when={!record()?.rejection && state()?.status === "published"}>
        <Show when={publishedHref()}>{href => <a href={href()}>View published post</a>}</Show>
        <Button disabled={busy()} onClick={() => { void run(async () => { await coordinator.discard(); setFile(null); clearPreviewUrls(); setCaption(""); }); }}>Start a new video</Button>
      </Show>
    </Show>
  </section>;
}

/** The local excerpt window for display, from integer milliseconds. */
function windowSpan(bounds: ExcerptBounds): string {
  return `${formatExcerptTime(bounds.startMs)} to ${formatExcerptTime(bounds.endMs)}`;
}
