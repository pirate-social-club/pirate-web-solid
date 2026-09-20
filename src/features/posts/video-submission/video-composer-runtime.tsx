import { createMemo, createSignal, onCleanup, Show, untrack } from "solid-js";
import { Button, FormNote } from "../../../design-system";
import { type ExcerptBounds, formatExcerptTime } from "../post-composer/song-excerpt";
import { SongExcerptComposer, type SoundtrackSelection } from "../post-composer/song-excerpt-composer";
import { createLocalExcerptDraftStore } from "../post-composer/song-excerpt-draft-store";
import type { SongSourceReader } from "../post-composer/song-excerpt-source";
import { OriginalVideoCaptureSurface, OriginalVideoReviewSurface } from "../post-composer/video-original-audio-surface";
import type { OriginalVideoCaptureInput, VideoCaptureSession } from "./capture";
import { captureStopAfterMs, clipFitMessage, fitClipToExcerpt } from "./clip-duration";
import { canDiscardRejectedVideo, VideoCoordinator, type PendingVideo, type VideoStorage } from "./coordinator";
import { SongReviewPreview, type PreviewAudio } from "./song-review-preview";
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
  readonly inspectFile?: (file: File) => Promise<File>;
  readonly measureDuration?: (file: File) => Promise<number | null>;
  /** The capture entry point, injected so the guide path can be driven without
   * a camera or an encoder. The default is the real capture module. */
  readonly startCapture?: (input: OriginalVideoCaptureInput) => Promise<VideoCaptureSession>;
  readonly createGuideAudio?: (url: string) => GuideAudio;
  /** Instrumentation for the guide's start boundary, in milliseconds between
   * the encoder starting and the guide's playback beginning. */
  readonly onGuideTiming?: (timing: { readonly startDelayMs: number }) => void;
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
  const mobile = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse) and (max-width: 767px)").matches;
  // One draft store per principal, built once. The excerpt is kept beside the
  // video draft rather than inside it: the video record is the coordinator's
  // and is governed by a submission contract this selection is not part of yet.
  const excerptStore = createLocalExcerptDraftStore(props.principalId);
  const songPreflight = props.songPreflight ?? createSongIntervalPreflight();
  // Where the retained excerpt stands with the server. That verdict is
  // separate from the author's soundtrack choice below: loading another song
  // resets the verdict, never the intent.
  const [songPlan, setSongPlan] = createSignal<SongPlanState>({ kind: "none" });
  // The author's soundtrack choice. Once a song loads it stays the choice —
  // through pending checks and song switches — until the author explicitly
  // replaces it with the video's own sound.
  const [songChoice, setSongChoice] = createSignal<SongChoice>({ kind: "none" });
  const [useOriginalSound, setUseOriginalSound] = createSignal(false);
  let picker: HTMLInputElement | undefined;
  let session: VideoCaptureSession | null = null;
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
    onProgress: (sent, total) => { if (!disposed) setProgress(`Uploaded ${sent} of ${total} bytes`); },
  });
  function showFile(next: File) {
    const previous = preview(); if (previous) URL.revokeObjectURL(previous);
    setFile(next); setPreview(URL.createObjectURL(next));
  }
  async function run<T>(action: () => Promise<T>): Promise<void> {
    if (busy() || disposed) return;
    setBusy(true); setError("");
    try { await action(); } catch (failure) { if (!disposed) setError(failure instanceof Error ? failure.message : "The video attempt could not be completed safely"); }
    finally { if (!disposed) setBusy(false); }
  }
  void coordinator.restore().then(next => {
    if (!next || disposed) return;
    showFile(next.file); setCaption(next.caption); setRating(next.rating);
  }).catch(failure => { if (!disposed) setError(failure instanceof Error ? failure.message : "Video restore failed"); })
    .finally(() => { if (!disposed) setBusy(false); });

  /** The song is the soundtrack only while it is the author's live intent: an
   * explicit switch to the video's own sound replaces it everywhere. */
  const songActive = () => songChoice().kind !== "none" && !useOriginalSound();
  /** The length the clip must reach for the current excerpt. */
  const clipFit = createMemo(() => fitClipToExcerpt(clipDurationMs(), selection()?.bounds));
  const clipProblem = createMemo(() => {
    const fit = clipFit();
    return fit.kind === "too_short" ? clipFitMessage(fit) : undefined;
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
  const takeMismatch = createMemo(() => {
    const take = takeSoundtrack();
    const current = selection();
    if (!take || !current) return false;
    return take.songPostId !== current.songPostId
      || take.bounds.startMs !== current.bounds.startMs
      || take.bounds.endMs !== current.bounds.endMs;
  });

  const stopGuide = () => {
    const audio = guideAudio;
    guideAudio = undefined;
    if (!audio) return;
    audio.removeEventListener("error", onGuideFailure);
    audio.removeEventListener("waiting", onGuideInterrupted);
    audio.removeEventListener("stalled", onGuideInterrupted);
    audio.pause();
  };
  const onGuideFailure = () => {
    if (disposed) return;
    void stopCapture("The guide song stopped unexpectedly, so the recording ended.");
  };
  /** Buffering mid-take means the guide is no longer keeping time with the
   * recording; the take ends rather than drifting silently. */
  const onGuideInterrupted = () => {
    if (disposed) return;
    void stopCapture("The guide song stalled, so this recording ended.");
  };
  async function startGuide(guide: SoundtrackSelection): Promise<boolean> {
    stopGuide();
    const audio = props.createGuideAudio ? props.createGuideAudio(guide.audioUrl) : new Audio(guide.audioUrl);
    guideAudio = audio;
    audio.addEventListener("error", onGuideFailure);
    audio.addEventListener("waiting", onGuideInterrupted);
    audio.addEventListener("stalled", onGuideInterrupted);
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
      await session?.cancel(); session = null; setStream(null); setCaptureStatus("idle");
      stopGuide();
      setTakeSoundtrack(null);
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
      if (!disposed) { showFile(take); await measureClip(take); }
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
        const current = await startCapture({
          onFailure: failure => {
            session = null; stopGuide();
            if (disposed) return;
            setStream(null); setError(failure.message);
            setCaptureStatus(failure.reason === "orientation_lost" ? "orientation_lost" : "capability_unavailable");
          },
          onLimit: () => { void stopCapture(); },
          ...(guide ? { limitMs: captureStopAfterMs(guide.bounds) } : {}),
        });
        if (disposed) { await current.cancel(); return; }
        session = current; setStream(current.stream); setCaptureStatus("recording");
        if (!guide) { setTakeSoundtrack(null); return; }
        const guideStartedAt = performance.now();
        const started = await startGuide(guide);
        const startDelayMs = Math.round(performance.now() - guideStartedAt);
        props.onGuideTiming?.({ startDelayMs });
        // A stop may have been honored while the guide was still starting.
        if (session !== current) return;
        if (!started) {
          session = null; setStream(null); setCaptureStatus("idle");
          await current.cancel().catch(() => {});
          throw new Error("The guide song would not play, so this recording did not start. Check your sound settings and try again.");
        }
        if (startDelayMs > GUIDE_START_MAX_DELAY_MS) {
          await stopCapture("The guide song started too late to keep this take in time, so it was ended. Record again.");
          return;
        }
        setTakeSoundtrack({ songPostId: guide.songPostId, bounds: guide.bounds });
      } catch (failure) {
        if (failure instanceof capture.VideoCaptureError) { setCaptureStatus(failure.reason === "camera_denied" ? "camera_denied" : "capability_unavailable"); }
        throw failure;
      }
    });
  }
  // A hidden page is where browser media playback is suspended without an
  // event. The guide then can no longer keep time with the recording, so the
  // take ends there rather than silently drifting. Backgrounding alone is not
  // a take-ending condition for an unguided recording.
  const interactionBusy = () => busy() || finalizing();
  const onVisibilityChange = () => {
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
        const originalChosen = useOriginalSound();
        // Publishing mid-check would silently decide for the author which
        // soundtrack they get, so it waits for the server's answer — unless
        // the author has explicitly chosen the video's own sound.
        if (!originalChosen && plan.kind === "checking") {
          throw new Error("The excerpt is still being checked. Publish again once it has an answer, or choose “Use original sound” to publish without it.");
        }
        // A chosen song is this video's soundtrack intent until the server
        // accepts an excerpt or the author explicitly switches to the video's
        // own sound. A song switch leaves the plan without a verdict; it must
        // not publish the video's own sound by itself.
        const approved = approvedSelection();
        if (!originalChosen && songChoice().kind !== "none" && approved === undefined) {
          throw new Error("This video is set to publish with the song, but the current excerpt hasn’t been accepted. Check the excerpt again, or choose “Use original sound” to publish without it.");
        }
        // A clip shorter than the excerpt cannot be rendered with it; the
        // server would refuse it after upload for a reason this surface can
        // state now, and a retry of the same bytes cannot change that.
        const impossible = clipProblem();
        if (!originalChosen && songChoice().kind !== "none" && impossible) throw new Error(impossible);
        // A guided take was danced to one window; publishing it against
        // another would show the author performing to a song that is not the
        // one being rendered.
        if (!originalChosen && songChoice().kind !== "none" && takeMismatch()) {
          throw new Error("This take was recorded to a different excerpt. Record again with the current excerpt, or choose “Use original sound” to publish without it.");
        }
        const attempt = { communityId: props.communityId, personaId: props.personaId, file: selected, caption: caption(), rating: rating() };
        await coordinator.begin(approved !== undefined && !originalChosen && songChoice().kind !== "none"
          ? { ...attempt, song: approved }
          : attempt);
      }
      if (disposed) return;
      await coordinator.submit();
    });
  }
  const poll = setInterval(() => {
    const state = record()?.snapshot;
    if ((state?.status === "manual_review" || (state?.status === "processing" && state.phase !== "awaiting_upload")) && !busy()) void run(() => coordinator.refresh());
  }, 3_000);
  onCleanup(() => {
    disposed = true; clearInterval(poll); coordinator.pauseUpload();
    stopGuide();
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityChange);
    void session?.cancel(); session = null;
    const url = preview(); if (url) URL.revokeObjectURL(url);
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
  const songReserved = () => { const reservation = record()?.reservation; return reservation?.intent === "song_reference" ? reservation : undefined; };
  return <section class="grid gap-3" aria-label="Video composer">
    <input ref={element => { picker = element; }} hidden type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={event => { void chooseFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
    <Show when={error()}>{message => <FormNote tone="warning">{message()}</FormNote>}</Show>
    <Show when={busy()}><p role="status">{progress() || "Preparing video…"}</p></Show>
    <Show when={editing()}>
      {/* The soundtrack step comes first, always. Its window is the length of
          the recording, so choosing it before capture is what lets the guide
          play and the take stop with the excerpt. */}
      <fieldset class="contents" disabled={captureStatus() === "recording" || finalizing()}>
      <section aria-label="Soundtrack">
        <SongExcerptComposer store={excerptStore} read={props.songReader} communityId={props.communityId}
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
      <Show when={songChoice().kind !== "none"}>
        <section class="grid gap-2" aria-label="Soundtrack choice">
          <Show when={useOriginalSound()}
            fallback={<p role="status">{songPlan().kind === "ready" && selection()
              ? `Publishing will post this video to the song, from ${windowSpan(selection()!.bounds)}.`
              : "A song is chosen as this video’s soundtrack, so publishing with the song is blocked until the server accepts an excerpt for it."}</p>}>
            <p role="status">Publishing will use this video’s own sound; the retained excerpt stays with the draft.</p>
          </Show>
          <Show when={!useOriginalSound()}>
            <Button disabled={busy()} onClick={() => setUseOriginalSound(true)}>Use original sound</Button>
          </Show>
          <Show when={useOriginalSound()}>
            <Button disabled={busy()} onClick={() => setUseOriginalSound(false)}>Use the song instead</Button>
          </Show>
        </section>
      </Show>
      </fieldset>
      <Show when={!file()}>
        <div inert={interactionBusy()}>
          <Show when={captureStatus() === "recording"}>
            <p role="status">{selection()
              ? `Recording to ${selection()!.title}. The take ends with the excerpt.`
              : "Recording. The take ends at the platform limit."}</p>
          </Show>
          <OriginalVideoCaptureSurface channel={mobile ? "camera" : "upload"} status={captureStatus()}
            onClose={props.onExit} onUpload={() => picker?.click()} onRecordToggle={() => { void toggleCapture(); }}
            onRetake={() => { setError(""); setCaptureStatus("idle"); }}
            preview={<Show when={stream()}><video ref={element => { element.srcObject = untrack(stream); }} autoplay muted playsinline class="h-full w-full object-cover" /></Show>} />
        </div>
      </Show>
    </Show>
    <Show when={editing() && file()}>
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
        <FormNote tone="warning">This take was recorded to a different excerpt. Record again with the current excerpt, or choose “Use original sound”.</FormNote>
      </Show>
      <OriginalVideoReviewSurface caption={caption()} onCaptionChange={setCaption} submitting={busy()} onPublish={() => { void publish(); }}
        onBack={() => { if (!busy()) { setFile(null); setClipDurationMs(null); const url = preview(); if (url) URL.revokeObjectURL(url); setPreview(undefined); } }}
        preview={songActive() && songPlan().kind === "ready" && selection()
          ? <SongReviewPreview audioUrl={selection()!.audioUrl} bounds={selection()!.bounds} videoUrl={preview()}
              createAudio={props.createGuideAudio} />
          : <video src={preview()} controls playsinline class="h-full w-full object-contain" />}
        sourceValue={songActive() && selection() ? `Song · ${selection()!.title}` : undefined}
        rightsValue={songActive() && songPlan().kind === "ready"
          ? "Song excerpt · rendered by the server"
          : undefined}
        rightsNote={songActive()
          ? "The published video’s soundtrack is the server-rendered song excerpt. The local preview shows the intended timing and is not the final master."
          : undefined} />
    </Show>
    <Show when={record()}>
      <p role="status">Video state: {record()?.rejection ? "request rejected" : state()?.status.replaceAll("_", " ") ?? "reservation pending"}.</p>
      <Show when={record()?.song && !record()?.rejection}>
        <p role="status">{songReserved()
          ? `The server reserved this video as posted to the song, from ${selectionSpan(record()!.song!)}, and froze that excerpt.`
          : "Asking the server to post this video to the song…"}</p>
      </Show>
      <Show when={record()?.rejection}><p role="alert">{songReservationRefusalText(record()?.rejection?.reasonCode)
        ?? "The video request was rejected. A new attempt will not start automatically."}</p></Show>
      <Show when={canDiscardRejectedVideo(record())}><Button disabled={busy()} onClick={() => { void run(async () => {
        const rejected = await coordinator.discardRejected(); showFile(rejected.file); setCaption(rejected.caption); setRating(rejected.rating);
      }); }}>Edit rejected video</Button></Show>
      <Show when={state()?.status === "manual_review"}><p>Your video remains private during review. No post is public yet.</p></Show>
      <Show when={blocked()?.reason_code === "song_reference_invalid"}><p role="status">{songReferenceInvalidText(blocked()?.song_reason_code)}</p></Show>
      <Show when={state()?.status === "blocked" || state()?.status === "abandoned"}><p>This attempt cannot publish. It will not be retried with a new identity.</p></Show>
      <Show when={!record()?.rejection && (record()?.pending || awaiting() || !state())}><Button disabled={busy()} onClick={() => { void publish(); }}>Resume video submission</Button></Show>
      <Show when={awaiting() && Date.parse(record()?.reservation?.upload.expires_at ?? "") <= Date.now()}><p role="status">This upload reservation has expired. Cancel this submission, then select the source again for a new video.</p></Show>
      <Show when={awaiting()}><Button disabled={busy()} onClick={() => { void run(() => coordinator.revisionCommand("cancel")); }}>Cancel video submission</Button></Show>
      <Show when={busy()}><Button onClick={() => coordinator.pauseUpload()}>Pause upload</Button></Show>
      <Show when={failure()?.reason_code === "provider_submission_unconfirmed"}><p role="status">The provider submission is unconfirmed. We need to reconcile it before another attempt is safe.</p></Show>
      <Show when={failure()?.reason_code === "membership_required"}><p role="status">Restore your community posting eligibility, then retry publication. Your completed analysis is retained.</p></Show>
      <Show when={failure()?.retryable}><Button disabled={busy()} onClick={() => { void run(() => coordinator.revisionCommand("retry")); }}>{failure()?.reason_code === "membership_required" ? "Retry publication" : "Retry processing"}</Button></Show>
      <Button disabled={busy()} onClick={() => { void run(() => coordinator.refresh()); }}>Check video status</Button>
      <Show when={publishedHref()}>{href => <a href={href()}>View published post</a>}</Show>
      <Show when={state() && ["published", "blocked", "abandoned"].includes(state()!.status)}>
        <Button disabled={busy()} onClick={() => { void run(async () => { await coordinator.discard(); setFile(null); const url = preview(); if (url) URL.revokeObjectURL(url); setPreview(undefined); setCaption(""); }); }}>Start a new video</Button>
      </Show>
    </Show>
  </section>;
}

/** The local excerpt window for display, from integer milliseconds. */
function windowSpan(bounds: ExcerptBounds): string {
  return `${formatExcerptTime(bounds.startMs)} to ${formatExcerptTime(bounds.endMs)}`;
}
