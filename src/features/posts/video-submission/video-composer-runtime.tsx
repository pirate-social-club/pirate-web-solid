import { VIDEO_DURATION_TIMEOUT_MS, VIDEO_FINALIZATION_TIMEOUT_MS, VideoPreparationDeadlineError, withVideoPreparationDeadline } from "./video-preparation-deadline";
import { createEffect, createMemo, createSignal, onCleanup, Show, untrack } from "solid-js";
import { ActionFooterShell, Button, buttonVariants, cn, FormNote, MobilePageHeader, Spinner } from "../../../design-system";
import { type ExcerptBounds } from "../post-composer/song-excerpt";
import { SongExcerptComposer, type SoundtrackSelection } from "../post-composer/song-excerpt-composer";
import { createMemoryExcerptDraftStore } from "../post-composer/song-excerpt-draft";
import type { SongSourceReader, SongSourceState } from "../post-composer/song-excerpt-source";
import type { SongPickerSource } from "../post-composer/song-picker";
import { OriginalVideoCaptureSurface, OriginalVideoReviewSurface } from "../post-composer/video-original-audio-surface";
import type { OriginalVideoCaptureInput, VideoCaptureSession } from "./capture";
import { captureStopAfterMs, clipFitMessage, fitClipToExcerpt, GUIDED_TAKE_MAX_DURATION_SECONDS, songLengthForClip } from "./clip-duration";
import type { VideoSnapshot } from "./contracts";
import { prepareBufferedGuide, type GuideSourcePreparation } from "./buffered-guide";
import { alignGuidedTake, type GuidedTakeAlignment } from "./guided-take-alignment";
import { isRetainedVersion, VideoCoordinator, type PendingVideo, type VideoStorage } from "./coordinator";
import { SongReviewPreview } from "./song-review-preview";
import { createBrowserVideoStorage } from "./storage";
import {
  createSongIntervalPreflight,
  type SongChoice,
  type SongIntervalPreflight,
  type SongPlanState,
  songReservationRefusalText,
} from "./song-reference";
import { createVideoTransport, type VideoTransport } from "./transport";

/** The guide audio for a recording. Injected so tests and stories can drive a
 * take without a decoder. */
export interface GuideAudio {
  currentTime: number;
  preload?: string;
  /** The media element's readiness; 4 is HAVE_ENOUGH_DATA. */
  readonly readyState?: number;
  /** What the element holds, in seconds. Absent where it cannot be read, in
   * which case there is nothing to wait for before recording. */
  readonly buffered?: { readonly length: number; start: (index: number) => number; end: (index: number) => number };
  play: () => Promise<void>;
  pause: () => void;
  addEventListener: (type: GuideAudioEvent, listener: () => void) => void;
  removeEventListener: (type: GuideAudioEvent, listener: () => void) => void;
}
type GuideAudioEvent = "error" | "waiting" | "stalled" | "playing" | "progress" | "canplaythrough";

/** How long the excerpt may take to load before a take. A song that is not
 * held by then is still streaming, and a take would stall on it. */
export const GUIDE_BUFFER_TIMEOUT_MS = 12_000;

/** Whether the guide can play the excerpt without waiting on the network:
 * After full Blob preparation, the decoder reports enough data or one
 * buffered range covers the excerpt. This is decoder readiness; it is never
 * accepted as proof that a remote download completed. */
export function excerptBuffered(audio: GuideAudio, bounds: { readonly startMs: number; readonly endMs: number }): boolean {
  if ((audio.readyState ?? 0) >= 4) return true;
  const ranges = audio.buffered;
  if (!ranges) return audio.readyState === undefined;
  const start = bounds.startMs / 1_000; const end = bounds.endMs / 1_000;
  for (let index = 0; index < ranges.length; index += 1) {
    if (ranges.start(index) <= start + 0.05 && ranges.end(index) >= end - 0.05) return true;
  }
  return false;
}

/** A guide that has not started within this window has lost the take's start
 * boundary; a longer wait would only record more video without the song. */
export const GUIDE_START_TIMEOUT_MS = 1_500;
/** How late the guide may start after the encoder is running before the take
 * is ended. The server places the song at video time zero, so this delay is
 * lip-sync offset; it cannot be corrected later. */
export const GUIDE_START_MAX_DELAY_MS = 750;

/** A community profile the host allows to author this video. */
export interface VideoPostingOption {
  readonly id: string;
  readonly label: string;
  /** The selected posting community must match the profile's binding. */
  readonly communityId?: string;
}

/** The panel a capture failure is shown as. A recording that started and then
 * failed can simply be tried again, and says nothing about the browser; only a
 * browser that cannot record at all is called unsupported. */
function failureStatus(reason: string): "camera_denied" | "recording_failed" | "capability_unavailable" {
  if (reason === "camera_denied") return "camera_denied";
  return reason === "encoder_failed" ? "recording_failed" : "capability_unavailable";
}

/** Resolve identity before mounting song choice or capture. A retained upload
 * keeps its original identity and remains recoverable even without an active
 * profile on the current page. No profile choice is made inside this flow. */
export function VideoComposerRuntime(props: Parameters<typeof VideoComposerSession>[0]) {
  const entry = untrack(() => {
    const personaId = props.personaId?.trim();
    const communityId = props.communityId?.trim();
    const eligible = props.personaOptions?.filter(option => !option.communityId || option.communityId === communityId);
    return { communityId, principalId: props.principalId, hasProfiles: eligible === undefined || eligible.length > 0, ready: Boolean(personaId) && (eligible === undefined || eligible.some(option => option.id === personaId)) };
  });
  const storage = untrack(() => props.storage ?? createBrowserVideoStorage(props.principalId));
  const [admitted, setAdmitted] = createSignal(entry.ready, { ownedWrite: true });
  // The page may still be resolving its active profile. Accept it before the
  // session mounts, then keep that session even if the shell profile changes.
  createEffect(() => {
    if (admitted()) return true;
    const personaId = props.personaId?.trim();
    const eligible = props.personaOptions?.filter(option => !option.communityId || option.communityId === props.communityId?.trim());
    return Boolean(personaId) && (eligible === undefined || eligible.some(option => option.id === personaId));
  }, ready => { if (ready) setAdmitted(true); });
  const [retained, setRetained] = createSignal(false);
  const [checking, setChecking] = createSignal(!entry.ready);
  const [failed, setFailed] = createSignal(false);
  let disposed = false;
  onCleanup(() => { disposed = true; });
  const checkRetained = async () => {
    if (disposed) return;
    setChecking(true); setFailed(false);
    try {
      const previous = await storage.exclusive(() => storage.load());
      if (previous !== null && (previous.principalId !== entry.principalId || !isRetainedVersion(previous))) throw new Error("Stored video could not be restored");
      if (!disposed) setRetained(previous !== null);
    } catch { if (!disposed) setFailed(true); }
    finally { if (!disposed) setChecking(false); }
  };
  if (!entry.ready) void Promise.resolve().then(checkRetained);
  return <Show when={admitted() || retained()} fallback={
    <ActionFooterShell fullViewport header={<MobilePageHeader class="relative z-10" title="Create video" onBackClick={props.onExit} />}
      footer={<Show when={!checking()}><div class="mx-auto w-full max-w-md">
        <Show when={failed()} fallback={entry.communityId
          ? <a class={cn(buttonVariants(), "w-full")} href={`/c/${encodeURIComponent(entry.communityId)}`}>Open community</a>
          : <Button class="w-full" onClick={props.onExit}>Back</Button>}>
          <Button class="w-full" onClick={() => { void checkRetained(); }}>Try again</Button>
        </Show>
      </div></Show>}>
      <div class="mx-auto grid w-full max-w-md gap-4 p-4" data-video-entry-prerequisite>
        <Show when={checking()} fallback={<p role={failed() ? "alert" : "status"}>{failed()
          ? "Your video couldn’t load. Try again."
          : entry.communityId ? entry.hasProfiles ? "Choose your profile on the community page." : "You need a profile in this community to create a video." : "Choose a community and profile before creating a video."}</p>}>
          <Spinner label="Preparing video" />
        </Show>
      </div>
    </ActionFooterShell>
  }><VideoComposerSession {...props} storage={storage} /></Show>;
}

function VideoComposerSession(props: {
  readonly principalId: string;
  /** The community page's fixed posting destination. */
  readonly communityId?: string;
  readonly personaId?: string;
  /** Eligible profiles, used only to validate the inherited active identity. */
  readonly personaOptions?: readonly VideoPostingOption[];
  /** The entry community. */
  readonly communityName?: string;
  readonly onExit: () => void;
  readonly onRetainedPersona: (personaId: string | null, communityId?: string) => void;
  readonly onPublished?: () => void;
  /** Where the author lands once the upload is sealed. Defaults to Home, where
   * the video appears as soon as it is playable. */
  readonly onPosted?: () => void;
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
  readonly prepareGuideSource?: GuideSourcePreparation;
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
  /** The picker's song source; production leaves it to the community feed
   * read, stories and tests stand in for it. */
  readonly songPicker?: SongPickerSource;
  /** Entering from a song post: the song is chosen before capture and the
   * recording plays it as a guide. */
  readonly initialSong?: { readonly postId: string };
}) {
  const [record, setRecord] = createSignal<PendingVideo | null>(null);
  const [file, setFile] = createSignal<File | null>(null);
  const [submittedFromReview, setSubmittedFromReview] = createSignal(false);
  const [rating, setRating] = createSignal<"general" | "adult_18">("general");
  const [preview, setPreview] = createSignal<string>();
  const [busy, setBusy] = createSignal(true);
  const [error, setError] = createSignal("");
  const [progress, setProgress] = createSignal("");
  const [captureStatus, setCaptureStatus] = createSignal<"idle" | "recording" | "camera_denied" | "capability_unavailable" | "recording_failed" | "orientation_lost" | "guide_interrupted">("idle");
  // The capture screen shows a panel for every state but these two, and the
  // panel says what happened, so the raw message would only repeat it.
  const panelShown = () => captureStatus() !== "idle" && captureStatus() !== "recording";
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
  // The selection is kept while the composer is open and starts fresh when it is
  // reopened; nothing is stored for a later session.
  const excerptStore = createMemoryExcerptDraftStore();
  const songPreflight = props.songPreflight ?? createSongIntervalPreflight();
  // Where the retained excerpt stands with the server. That verdict is
  // separate from the author's soundtrack choice below: loading another song
  // resets the verdict, never the intent.
  const [songPlan, setSongPlan] = createSignal<SongPlanState>({ kind: "none" });
  // The author's soundtrack choice. Every video references a song (owner
  // ruling 2026-09-24), so once a song loads it stays the choice through
  // pending checks and song switches.
  const [songChoice, setSongChoice] = createSignal<SongChoice>({ kind: "none" });
  // Where the song read stands, for the sheet's heading: a song that is loading
  // or loaded is a song already chosen, one that failed to load is not.
  const [songSource, setSongSource] = createSignal<SongSourceState["kind"]>("idle");
  // Song choice is the first screen. Keep it mounted after continuing so the
  // excerpt and server verdict survive capture, review and a later song change.
  const [songSheetOpen, setSongSheetOpen] = createSignal(true, { ownedWrite: true });
  const [enteredCapture, setEnteredCapture] = createSignal(false);
  // The host fixes the community and its active profile before opening capture.
  const [chosenCommunityId, setChosenCommunityId] = createSignal(
    props.communityId?.trim() || "",
    { ownedWrite: true },
  );
  const personasForDestination = createMemo(() => (props.personaOptions ?? [])
    .filter(option => option.communityId === undefined || option.communityId === chosenCommunityId()));
  const [chosenPersonaId, setChosenPersonaId] = createSignal(
    props.personaOptions === undefined ? props.personaId?.trim() || ""
      : personasForDestination().find(option => option.id === props.personaId?.trim())?.id || "",
    { ownedWrite: true },
  );
  let picker: HTMLInputElement | undefined;
  let session: VideoCaptureSession | null = null;
  // The live camera shown before a take. Recording takes it over; anything
  // else that leaves the capture screen stops it.
  let previewStream: MediaStream | null = null;
  let previewOpening = false;
  let previewRequest: Promise<void> | null = null;
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
      // A retained video knows its own community and persona. Adopt them so
      // recovery reports an actual mismatch rather than an empty context.
      if (next !== null) {
        if (next.communityId && !chosenCommunityId()) setChosenCommunityId(next.communityId);
        if (next.personaId && !chosenPersonaId()) setChosenPersonaId(next.personaId);
      }
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
  /** `explained` says the screen already reports this failure in its own words,
   * so the raw message would only repeat it; only an action that can itself
   * produce that state passes it. A later action that fails is a new fact. */
  async function run<T>(action: () => Promise<T>, explained?: () => boolean): Promise<void> {
    if (busy() || disposed) return;
    setBusy(true); setError(""); setProgress("");
    try { await action(); } catch (failure) { if (!disposed && !explained?.()) setError(failure instanceof Error ? failure.message : "The video attempt could not be completed safely"); }
    finally { if (!disposed) { setBusy(false); setProgress(""); } }
  }
  let landed = false;
  const posted = () => { if (landed || disposed) return; landed = true; (props.onPosted ?? (() => globalThis.location?.assign("/")))(); };
  let resumeSubmitted = false;
  void coordinator.restore().then(async next => {
    if (!next || disposed) return;
    // A video whose upload already finished belongs to the server; it is never
    // shown again as a pending state here.
    if (await coordinator.release()) return;
    showFile(next.file); setRating(next.rating);
    // Only a video the author already submitted for publication is ever kept.
    // One that still owes its upload picks up where it stopped, with no control
    // to press. One that belongs to another community waits for that community.
    resumeSubmitted = !next.rejection
      && (next.pending !== null || !next.snapshot || (next.snapshot.status === "processing" && next.snapshot.phase === "awaiting_upload"))
      && next.communityId === chosenCommunityId() && next.personaId === chosenPersonaId();
  }).catch(failure => { if (!disposed) setError(failure instanceof Error ? failure.message : "Video restore failed"); })
    .finally(() => {
      if (disposed) return;
      setBusy(false);
      // A write is not visible to a read in the same tick, so the resume waits
      // one tick for the busy gate to open.
      if (resumeSubmitted) setTimeout(() => { if (!disposed) void publish(); }, 0);
    });

  /** Whether a song has been chosen as the soundtrack. */
  const songActive = () => songChoice().kind !== "none";
  /** Every video uses a song, so the camera waits until one is chosen. */
  const songChosen = () => songActive() && selection() !== null;
  /** Excerpt controls appear only after the song loads. */
  const songSheetTitle = () =>
    songSource() === "ready" && !["refused", "ineligible", "not_available", "timing_unavailable"].includes(songPlan().kind) ? "Song" : "Choose a song";
  const songLabel = () => {
    const current = selection();
    return songActive() && current ? current.title : undefined;
  };
  /** The length the clip must reach for the current excerpt. */
  const clipFit = createMemo(() => fitClipToExcerpt(clipDurationMs(), selection()?.bounds));
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
  /** Whether recording or upload may start: a song and excerpt are chosen,
   * the server has accepted exactly that selection, and a posting destination
   * and profile are selected. A pending or refused plan, or an approval for a
   * window the author has moved away from, keeps both capture channels closed.
   * Reservation checks the selected profile and song again. */
  const captureReady = () => songChosen() && approvedSelection() !== undefined
    && chosenCommunityId() !== "" && chosenPersonaId() !== ""
    && (props.personaOptions === undefined || personasForDestination().some(option => option.id === chosenPersonaId()));
  /** The excerpt a guided take was recorded to, when one was. A take danced to
   * one window cannot be published against another. */
  const [takeSoundtrack, setTakeSoundtrack] = createSignal<{ readonly songPostId: string; readonly bounds: ExcerptBounds } | null>(null);
  /** Whether the guided take was trimmed to the guide's start. An unaligned
   * take must not be published with the song: the motion would be ahead of
   * the music by the measured delay. */
  const [takeAlignment, setTakeAlignment] = createSignal<"none" | "aligned" | "unaligned">("none");
  const clipProblem = createMemo(() => {
    if (!takeSoundtrack() && (clipDurationMs() ?? 0) > 15_000) return "Choose a video up to 15 seconds long.";
    const fit = clipFit();
    return fit.kind === "too_short" || fit.kind === "too_long" ? clipFitMessage(fit) : undefined;
  });
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
  // for it would cancel every recording on a slow network. `stalled` is not
  // listened for: it only says the download paused, and playback continues
  // from what is buffered. The excerpt is loaded before the take starts.
  let guidePreparation: AbortController | undefined;
  const guideReleases = new WeakMap<GuideAudio, () => void>();
  const releaseGuide = (audio: GuideAudio) => { guideReleases.get(audio)?.(); guideReleases.delete(audio); };
  let guidePlaying = false;
  let guideWaitTimer: ReturnType<typeof setTimeout> | undefined;
  // `waiting` may be a short buffer transition while playback keeps moving.
  // Confirm a real gap before discarding the take, while limiting drift.
  const GUIDE_WAIT_CONFIRM_MS = 80;
  const GUIDE_WAIT_MIN_PROGRESS_SECONDS = 0.04;
  const onGuidePlaying = () => { guidePlaying = true; };
  const stopGuide = () => {
    if (guideWaitTimer !== undefined) clearTimeout(guideWaitTimer);
    guideWaitTimer = undefined;
    const audio = guideAudio;
    guideAudio = undefined;
    guidePlaying = false;
    if (!audio) return;
    audio.removeEventListener("error", onGuideFailure);
    audio.removeEventListener("waiting", onGuideInterrupted);
    audio.removeEventListener("playing", onGuidePlaying);
    audio.pause();
    releaseGuide(audio);
  };
  const onGuideFailure = () => {
    if (disposed) return;
    void cancelInterruptedTake();
  };
  /** A sustained playback gap would put the author behind the final song. */
  const onGuideInterrupted = () => {
    const audio = guideAudio;
    if (disposed || !guidePlaying || !audio || guideWaitTimer !== undefined) return;
    const before = audio.currentTime;
    guideWaitTimer = setTimeout(() => {
      guideWaitTimer = undefined;
      if (disposed || guideAudio !== audio || !session) return;
      if (audio.currentTime - before >= GUIDE_WAIT_MIN_PROGRESS_SECONDS) return;
      void cancelInterruptedTake();
    }, GUIDE_WAIT_CONFIRM_MS);
  };
  const createGuide = (url: string): GuideAudio => props.createGuideAudio ? props.createGuideAudio(url) : new Audio(url);
  /** Loads the excerpt before the camera starts, so a take never begins on a
   * song that has not arrived. Resolves with the element once it can play the
   * excerpt through, or null when that does not happen in time or the song
   * fails to load. */
  async function prepareGuide(guide: SoundtrackSelection): Promise<GuideAudio | null> {
    guidePreparation?.abort();
    const controller = new AbortController();
    guidePreparation = controller;
    let source;
    try { source = await (props.prepareGuideSource ?? prepareBufferedGuide)(guide.songPostId, controller.signal); }
    catch { if (guidePreparation === controller) guidePreparation = undefined; return null; }
    if (disposed || controller.signal.aborted || !guideStillCurrent(guide)) { source.release(); return null; }
    let audio: GuideAudio;
    try { audio = createGuide(source.url); } catch { source.release(); return null; }
    guideReleases.set(audio, source.release);
    audio.preload = "auto";
    audio.currentTime = guide.bounds.startMs / 1_000;
    if (excerptBuffered(audio, guide.bounds)) { if (guidePreparation === controller) guidePreparation = undefined; return audio; }
    return new Promise(resolve => {
      let settled = false;
      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        clearInterval(poll); clearTimeout(timer);
        audio.removeEventListener("progress", check);
        audio.removeEventListener("canplaythrough", check);
        audio.removeEventListener("error", fail);
        controller.signal.removeEventListener("abort", fail);
        if (guidePreparation === controller) guidePreparation = undefined;
        if (!ready || disposed) { audio.pause(); releaseGuide(audio); }
        resolve(ready && !disposed ? audio : null);
      };
      const check = () => { if (disposed || excerptBuffered(audio, guide.bounds)) finish(!disposed); };
      const fail = () => finish(false);
      controller.signal.addEventListener("abort", fail, { once: true });
      audio.addEventListener("progress", check);
      audio.addEventListener("canplaythrough", check);
      audio.addEventListener("error", fail);
      const poll = setInterval(check, 250);
      const timer = setTimeout(() => finish(false), GUIDE_BUFFER_TIMEOUT_MS);
    });
  }
  async function startGuide(guide: SoundtrackSelection, prepared: GuideAudio): Promise<boolean> {
    stopGuide();
    const audio = prepared;
    guideAudio = audio;
    audio.addEventListener("error", onGuideFailure);
    audio.addEventListener("waiting", onGuideInterrupted);
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

  let measurementAbort: AbortController | undefined;
  let measurementRevision = 0;
  let finalizationAbort: AbortController | undefined;
  const discardUnfinishedTake = () => {
    setFile(null); setClipDurationMs(null); clearPreviewUrls();
    setTakeSoundtrack(null); setTakeAlignment("none");
  };
  async function measureClip(next: File, parent?: AbortSignal) {
    if (!selection()) { setClipDurationMs(null); return; }
    measurementAbort?.abort();
    const controller = new AbortController();
    measurementAbort = controller;
    const revision = ++measurementRevision;
    const abort = () => controller.abort(parent?.reason);
    parent?.addEventListener("abort", abort, { once: true });
    if (parent?.aborted) abort();
    setMeasuring(true);
    try {
      const duration = await withVideoPreparationDeadline(async signal => {
        return props.measureDuration
          ? props.measureDuration(next)
          : (await import("./capture")).measureVideoDuration(next, signal);
      }, VIDEO_DURATION_TIMEOUT_MS, controller.signal);
      if (!disposed && revision === measurementRevision && file() === next) setClipDurationMs(duration);
    } catch (failure) {
      if (disposed || revision !== measurementRevision) return;
      if (file() === next && failure instanceof VideoPreparationDeadlineError) discardUnfinishedTake();
      throw failure;
    } finally {
      parent?.removeEventListener("abort", abort);
      if (measurementAbort === controller) measurementAbort = undefined;
      if (!disposed && revision === measurementRevision) setMeasuring(false);
    }
  }

  async function chooseFile(next: File | undefined) {
    if (!next || record()) return;
    // The upload channel shares the capture gate: a take must not be sealed
    // against an excerpt the server has not accepted for this profile.
    if (!captureReady()) return;
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
      const accepted = props.inspectFile ? await props.inspectFile(next, { maxDurationSeconds: 15 }) : await (await import("./capture")).inspectVideoFile(next, { maxDurationSeconds: 15 });
      if (disposed) return;
      showFile(accepted);
      await measureClip(accepted);
    });
  }
  /** Stops the take without the UI busy gate. A limit or a
   * guide failure must be honorable while `toggleCapture` is still awaiting
   * the guide's playback start, and `run` would drop such a request. */
  async function stopCapture(reason?: string) {
    const current = session;
    if (!current) { if (reason && !disposed) setError(reason); return; }
    session = null;
    stopGuide();
    setFinalizing(true);
    const controller = new AbortController();
    finalizationAbort = controller;
    try {
      await withVideoPreparationDeadline(async signal => {
        const take = await current.stop();
        signal.throwIfAborted();
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
            signal.throwIfAborted();
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
            signal.throwIfAborted();
            finalTake = candidate;
            if (!disposed) setTakeAlignment(aligned ? "aligned" : "unaligned");
            props.onTakeAlignment?.({ offsetMs: guideStartDelayMs, trimmedMs: aligned ? alignment.trimmedMs : 0, aligned });
          }
        } else {
          if (!disposed) setTakeAlignment("none");
        }
        signal.throwIfAborted();
        if (!disposed) { showOriginalTake(take); showFile(finalTake); await measureClip(finalTake, signal); }
      }, VIDEO_FINALIZATION_TIMEOUT_MS, controller.signal);
    } catch (failure) {
      if (!disposed) {
        if (failure instanceof VideoPreparationDeadlineError) discardUnfinishedTake();
        setError(failure instanceof Error ? failure.message : "The recording couldn’t finish. Record again.");
      }
      // Adapter cancellation may itself hang. Release owned camera tracks now.
      void current.cancel().catch(() => {});
    } finally {
      if (finalizationAbort === controller) finalizationAbort = undefined;
      stopTracks(current.stream);
      if (!disposed) { setFinalizing(false); setStream(null); setCaptureStatus("idle"); }
    }
    // The stop is what ends the take; the reason goes up after it so the
    // finalization cannot clear it.
    if (reason && !disposed) setError(reason);
  }
  /** An interrupted guide invalidates the take. It must never enter review or
   * become a retained video; the chosen song remains ready for another try. */
  async function cancelInterruptedTake() {
    const current = session;
    if (!current) return;
    session = null;
    stopGuide();
    setTakeSoundtrack(null);
    setTakeAlignment("none");
    guideStarted = false;
    guideStartExceeded = false;
    if (!disposed) {
      setStream(null);
      setError("");
      setCaptureStatus("guide_interrupted");
    }
    await current.cancel().catch(() => {});
  }
  /** A guide prepared from one exact excerpt is only usable while that exact
   * excerpt is still the chosen one: a take danced to one window cannot be
   * started against another, however quickly the new window is approved. */
  function guideStillCurrent(guide: SoundtrackSelection): boolean {
    const current = selection();
    return current !== null
      && current.songPostId === guide.songPostId
      && current.bounds.startMs === guide.bounds.startMs
      && current.bounds.endMs === guide.bounds.endMs;
  }

  async function toggleCapture() {
    // Stopping is always available; only starting is gated on acceptance.
    if (session) { await stopCapture(); return; }
    if (!captureReady()) return;
    await run(async () => {
      const startCapture = props.startCapture
        ?? (async (input: OriginalVideoCaptureInput) => (await import("./capture")).startOriginalVideoCapture(input));
      const capture = await import("./capture");
      const guide = songActive() ? selection() : null;
      // The excerpt is loaded before the camera starts, so a take never begins
      // on a song that is still streaming from the network.
      let prepared: GuideAudio | undefined;
      if (guide) {
        setProgress("Loading the song…");
        const ready = await prepareGuide(guide);
        if (disposed) { if (ready) { ready.pause(); releaseGuide(ready); } return; }
        // The song panel can change while the guide loads; the approval that
        // opened the capture surface is not a license that survives it, and
        // a newly approved excerpt must not be recorded against the guide
        // prepared for the old one.
        if (!captureReady() || !guideStillCurrent(guide)) { if (ready) { ready.pause(); releaseGuide(ready); } return; }
        setProgress("");
        if (!ready) throw new Error("The song didn't finish loading, so recording didn't start. Check your connection and try again.");
        prepared = ready;
      }
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
      // A first-use camera permission prompt can still be open when Record is
      // tapped. Wait for that request instead of starting a second competing
      // getUserMedia call, which can make both requests fail on the phone.
      if (previewRequest) await previewRequest;
      if (captureStatus() !== "idle" || !captureReady()) return;
      // The live preview becomes the recording's stream, so the take starts
      // from the picture already on screen instead of reopening the camera.
      const handed = previewStream;
      previewStream = null;
      let current: VideoCaptureSession;
      captureStarting = true;
      try {
        // The last synchronous boundary before the camera rolls: every await
        // above could have raced a song-panel change, so both the gate and
        // the guide's identity are asked once more, immediately before the
        // take begins.
        if (!captureReady() || (guide !== null && !guideStillCurrent(guide))) {
          captureStarting = false;
          // The preview stream was taken above and nothing holds it now, so
          // release it here or the camera stays on.
          stopTracks(handed);
          if (handed && stream() === handed) setStream(null);
          return;
        }
        current = await startCapture({
          onFailure: failure => {
            session = null; stopGuide();
            if (disposed) return;
            setStream(null); setError(failure.message);
            // An interrupted take was cancelled, not saved: the author is
            // back at the camera and can simply record again.
            setCaptureStatus(failure.reason === "orientation_lost" ? "orientation_lost"
              : failure.reason === "interrupted" ? "idle" : failureStatus(failure.reason));
          },
          onLimit: () => { void stopCapture(); },
          ...(guide ? { limitMs: captureStopAfterMs(guide.bounds) } : {}),
          ...(handed ? { stream: handed } : {}),
        });
      } catch (failure) {
        prepared?.pause();
        stopTracks(handed);
        if (handed && stream() === handed) setStream(null);
        throw failure;
      } finally {
        captureStarting = false;
      }
        if (disposed || document.visibilityState === "hidden") {
          await current.cancel(); stopGuide();
          if (!disposed) { setStream(null); setTakeSoundtrack(null); setTakeAlignment("none"); setCaptureStatus("guide_interrupted"); }
          return;
        }
        session = current; setStream(current.stream); setCaptureStatus("recording");
        if (!guide) return;
        if (!prepared) throw new Error("The song did not finish loading.");
        const started = await startGuide(guide, prepared);
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
          setTakeSoundtrack(null); setTakeAlignment("none"); setPlaybackFailed(true); setSongSheetOpen(true);
          throw new Error("This song won’t play. Try again or choose another song.");
        }
        guideStarted = true;
        if (startDelayMs > GUIDE_START_MAX_DELAY_MS) {
          guideStartExceeded = true;
          await stopCapture("The song started too late. Record again.");
          return;
        }
      } catch (failure) {
        if (failure instanceof capture.VideoCaptureError) { setCaptureStatus(failureStatus(failure.reason)); }
        throw failure;
      } finally {
        if (prepared && guideAudio !== prepared) { prepared.pause(); releaseGuide(prepared); }
      }
    });
  }
  // A hidden page is where browser media playback is suspended without an
  // event. The guide then can no longer keep time with the recording, so the
  // recording is discarded there rather than silently drifting. An unguided take is
  // cancelled by the capture module instead, because its picture freezes.
  const interactionBusy = () => busy() || finalizing();
  // The camera preview is held only while the page is visible.
  const [pageVisible, setPageVisible] = createSignal(typeof document === "undefined" || document.visibilityState !== "hidden");
  const onVisibilityChange = () => {
    setPageVisible(document.visibilityState !== "hidden");
    if (document.visibilityState !== "hidden" || !session || !guideAudio) return;
    void cancelInterruptedTake();
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityChange);

  async function publish() {
    await run(async () => {
      const retained = coordinator.current;
      if (retained && (retained.communityId !== chosenCommunityId() || retained.personaId !== chosenPersonaId())) throw new Error("Your earlier video is still uploading for another community. Open that community to finish it.");
      if (!retained) {
        const selected = file(); if (!selected || !chosenPersonaId() || !chosenCommunityId()) throw new Error("Choose a profile and a video.");
        const plan = songPlan();
        // Every video references a song. Publishing waits for a chosen song
        // and the server's acceptance of its excerpt.
        if (songChoice().kind === "none") throw new Error("Choose a song for this video.");
        if (plan.kind === "checking") throw new Error("The song is still being checked. Try again shortly.");
        // A song switch leaves the plan without a verdict; only the excerpt
        // on screen, accepted by the server, can be published.
        const approved = approvedSelection();
        if (approved === undefined) throw new Error("Choose a different part of the song.");
        // A clip shorter than the excerpt cannot be rendered with it; the
        // server would refuse it after upload for a reason this surface can
        // state now, and a retry of the same bytes cannot change that.
        const impossible = clipProblem();
        if (impossible) throw new Error(impossible);
        // A guided take was danced to one window; publishing it against
        // another would show the author performing to a song that is not the
        // one being rendered.
        if (takeMismatch()) throw new Error("The song changed. Record a new video.");
        // An unaligned take would publish with its motion ahead of the music.
        if (takeSoundtrack() && takeAlignment() === "unaligned") {
          throw new Error("The video couldn’t play in time with the song. Record again.");
        }
        setSubmittedFromReview(true);
        await coordinator.begin({
          communityId: chosenCommunityId(), personaId: chosenPersonaId(), file: selected,
          caption: "", rating: rating(), song: approved,
        });
      }
      if (disposed) return;
      try { await coordinator.submit(); }
      catch (failure) {
        // A finalize whose answer was lost may still have been accepted. The
        // submission is read before the author is told anything failed.
        if (!finalizeUnconfirmed()) throw failure;
        if (await settleFinalize()) return;
        // Keep the receipt for reconciliation; the author has finished uploading.
        if (!disposed) posted();
        return;
      }
      if (!disposed && await coordinator.release()) posted();
    }, publishFailureExplained);
  }
  /** Whether a finalize was sent and its answer never arrived. */
  const finalizeUnconfirmed = () => record()?.pending?.command.kind === "finalize";
  /** Reads the submission behind an unconfirmed finalize; goes Home once the
   * server has it. A failed read leaves everything retained. */
  async function settleFinalize(): Promise<boolean> {
    const settled = await coordinator.settleFinalize().catch(() => false);
    if (settled && !disposed) posted();
    return settled;
  }
  let backgroundRefresh: Promise<VideoSnapshot | null | boolean> | null = null;
  const poll = setInterval(() => {
    if (finalizeUnconfirmed() && !busy() && !backgroundRefresh) {
      backgroundRefresh = settleFinalize().finally(() => { backgroundRefresh = null; });
      return;
    }
    const state = record()?.snapshot;
    if ((state?.status === "manual_review" || (state?.status === "processing" && state.phase !== "awaiting_upload"))
      && !busy() && !backgroundRefresh) {
      // A passive read must not flash the action button every three seconds.
      backgroundRefresh = coordinator.refresh();
      void backgroundRefresh.catch(() => null).finally(() => { backgroundRefresh = null; });
    }
  }, 3_000);
  onCleanup(() => {
    disposed = true; guidePreparation?.abort(); measurementAbort?.abort(); finalizationAbort?.abort(); clearInterval(poll); coordinator.pauseUpload();
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
  // A refused play is shown as a tap target, never as a dark viewfinder: a
  // tap is a gesture the browser honors.
  const [viewfinderStalled, setViewfinderStalled] = createSignal(false);
  const playLive = (element: HTMLVideoElement) => {
    void element.play()?.then(() => setViewfinderStalled(false), () => setViewfinderStalled(true));
  };
  const showLive = (element: HTMLVideoElement, media: MediaStream | null) => {
    if (element.srcObject !== media) element.srcObject = media;
    if (media && element.paused) playLive(element);
  };
  createEffect(() => stream(), media => {
    if (viewfinder && viewfinder.isConnected) showLive(viewfinder, media);
  });
  // The camera opens when the capture screen shows, once the chosen excerpt
  // has been accepted by the server, not when recording starts: the author
  // frames the shot first. It closes when the screen goes away, and again
  // while a moved window waits for a new acceptance.
  createEffect(() => mobile && captureReady() && !songSheetOpen() && pageVisible() && !record() && !file() && captureStatus() === "idle" && !finalizing(), capturing => {
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
    const request = Promise.resolve().then(() => {
      if (disposed) return;
      return open().then(media => {
        previewOpening = false;
        const stillCapturing = !disposed && !session && !captureStarting && !record() && !file() && captureReady() && !songSheetOpen()
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
    previewRequest = request;
    void request.then(() => { if (previewRequest === request) previewRequest = null; });
  });
  const state = () => record()?.snapshot;
  const failure = () => { const snapshot = state(); return snapshot?.status === "processing_failed" ? snapshot : undefined; };
  const editing = () => !record();
  const awaiting = () => { const snapshot = state(); return snapshot?.status === "processing" && snapshot.phase === "awaiting_upload"; };
  /** An upload whose window has closed cannot be resumed, only cancelled. */
  const uploadExpired = (current: PendingVideo | null) => {
    const snapshot = current?.snapshot;
    return snapshot?.status === "processing" && snapshot.phase === "awaiting_upload"
      && Date.parse(current?.reservation?.upload.expires_at ?? "") <= Date.now();
  };
  const reservationExpired = () => uploadExpired(record());
  /** Whether a failed publish attempt is already explained on screen: the server
   * refused the video, or its upload window has closed. Each has a plain sentence
   * of its own, and the failure carries the server's or coordinator's wording for
   * the same fact. Read from the coordinator, because a write to the record signal
   * is not visible to a read in the same tick. */
  const publishFailureExplained = () => {
    const current = coordinator.current;
    return current?.rejection !== undefined || uploadExpired(current);
  };
  const otherDestination = () => record() !== null && (record()!.communityId !== chosenCommunityId() || record()!.personaId !== chosenPersonaId());
  const profileReady = () => chosenPersonaId() !== "" && (props.personaOptions === undefined || personasForDestination().some(option => option.id === chosenPersonaId()));
  const reviewVisible = () => file() !== null && (editing() || (submittedFromReview() && !record()?.rejection && !reservationExpired()));
  const completedUpload = () => finalizeUnconfirmed() || (!awaiting() && state() !== undefined && !record()?.rejection);
  const statusText = () => {
    if (otherDestination()) return "Finish this upload in the community where you started it.";
    if (record()?.rejection) return songReservationRefusalText(record()?.rejection?.reasonCode) ?? "This video wasn’t accepted.";
    if (reservationExpired()) return error() ? "Couldn’t start over. Try again." : "This upload expired.";
    if (completedUpload()) return "Your video has uploaded.";
    if (busy()) return progress() || "Uploading video…";
    return "Your video couldn’t upload. Try again.";
  };
  const startOver = async () => {
    if (record()?.rejection) await coordinator.discardRejected();
    else {
      if (awaiting() || failure()?.reason_code === "provider_submission_unconfirmed") await coordinator.revisionCommand("cancel");
      await coordinator.discard();
    }
    setFile(null); setClipDurationMs(null); clearPreviewUrls(); setSubmittedFromReview(false); setRating("general");
    setTakeSoundtrack(null); setTakeAlignment("none"); setCaptureStatus("idle"); setEnteredCapture(false); setSongSheetOpen(true);
  };
  const openSongSheet = () => setSongSheetOpen(true);
  /** Confirming the sound: an accepted excerpt closes the sheet; anything
   * still pending puts its progress on the confirm button and closes by
   * itself once the exact excerpt is accepted; a refusal keeps the sheet
   * open with its actions. */
  const [confirmingSound, setConfirmingSound] = createSignal(false, { ownedWrite: true });
  const [checkingPlayback, setCheckingPlayback] = createSignal(false);
  const [playbackFailed, setPlaybackFailed] = createSignal(false);
  let checkingAudio: GuideAudio | undefined;
  let playbackCheckRevision = 0;
  onCleanup(() => checkingAudio?.pause());
  const enterCapture = async () => {
    const approved = approvedSelection();
    const chosen = selection();
    if (!approved || !chosen || checkingPlayback() || !profileReady()) return;
    const revision = ++playbackCheckRevision;
    setConfirmingSound(false); setPlaybackFailed(false); setError("");
    if (mobile && !file()) {
      setCheckingPlayback(true);
      let audio: GuideAudio | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        audio = createGuide(chosen.audioUrl);
        checkingAudio = audio;
        audio.currentTime = chosen.bounds.startMs / 1_000;
        const played = await Promise.race([
          audio.play().then(() => true),
          new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), GUIDE_BUFFER_TIMEOUT_MS); }),
        ]);
        if (!played) throw new Error("Playback did not start");
      } catch {
        if (!disposed && revision === playbackCheckRevision && guideStillCurrent(chosen)) { setPlaybackFailed(true); setError("This song won’t play. Try again or choose another song."); }
        return;
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        audio?.pause();
        if (revision === playbackCheckRevision) {
          checkingAudio = undefined;
          if (!disposed) setCheckingPlayback(false);
        }
      }
    }
    if (disposed || revision !== playbackCheckRevision || !songSheetOpen() || !guideStillCurrent(chosen) || approvedSelection() === undefined) return;
    setEnteredCapture(true); setSongSheetOpen(false);
  };
  const confirmSound = () => {
    if (approvedSelection() !== undefined) {
      void enterCapture();
      return;
    }
    const kind = songPlan().kind;
    if (kind === "checking" || kind === "measuring") setConfirmingSound(true);
  };
  createEffect(
    () => ({ confirming: confirmingSound(), approved: approvedSelection() !== undefined, settled: songPlan().kind }),
    ({ confirming, approved, settled }) => {
      if (!confirming) return;
      if (approved) {
        void enterCapture();
        return;
      }
      if (settled === "refused" || settled === "failed" || settled === "ineligible" || settled === "not_available" || settled === "timing_unavailable") {
        setConfirmingSound(false);
      }
    },
  );
  /** The states the author must know about before recording, shown over the
   * capture view. Pending checks are machinery, not information: they say
   * nothing here and surface only on the sound sheet's confirm action. */
  const captureNotice = () => {
    if (file()) return undefined;
    if (busy() && progress()) return <div class="flex justify-center"><Spinner label={progress().replace(/…$/, "")} /></div>;
    if (finalizing()) return <div class="flex justify-center"><Spinner label="Finishing video" /></div>;
    if (!panelShown() && error()) return <FormNote class="rounded-[var(--radius-lg)] bg-black/70 px-3 py-2" tone="warning">{error()}</FormNote>;
    if (props.personaOptions !== undefined && personasForDestination().length === 0) {
      return <p class="rounded-[var(--radius-lg)] bg-black/60 px-3 py-2 text-center text-sm text-white" role="status">Choose a posting profile for this community.</p>;
    }
    if (chosenPersonaId() === "") return <p class="rounded-[var(--radius-lg)] bg-black/60 px-3 py-2 text-center text-sm text-white" role="status">Choose a profile before recording.</p>;
    return undefined;
  };
  return <section class="grid gap-3" aria-label="Video composer">
    <input ref={element => { picker = element; }} hidden type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={event => { void chooseFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />

    <Show when={editing()}>
      {/* Capture carries the chosen song and a way to change it. */}
      <Show when={!file() && !songSheetOpen()}>
      <div inert={interactionBusy()}>
        <Show when={captureStatus() === "recording"}>
          <p role="status" class="sr-only">{selection()
            ? `Recording to ${selection()!.title}. Recording ends with the song.`
            : "Recording."}</p>
        </Show>
        <OriginalVideoCaptureSurface channel={mobile ? "camera" : "upload"} status={captureStatus()}
          songLabel={songLabel()} onSongTap={openSongSheet}
          onClose={props.onExit} onBack={openSongSheet} onUpload={() => picker?.click()} onRecordToggle={() => { void toggleCapture(); }}
          onRetake={() => { setError(""); setCaptureStatus("idle"); }}
          notice={captureNotice()}
          preview={<>
            <video ref={element => { viewfinder = element; showLive(element, untrack(stream)); }} autoplay muted playsinline
              class={stream() ? "h-full w-full object-cover" : "hidden"} />
            <Show when={stream() && viewfinderStalled()}>
              <button type="button" data-video-viewfinder-resume
                class="absolute inset-x-0 top-1/2 z-10 mx-auto w-fit -translate-y-1/2 rounded-[var(--radius-lg)] bg-black/70 px-4 py-2 text-sm text-white"
                onClick={() => { if (viewfinder) playLive(viewfinder); }}>
                Resume camera preview
              </button>
            </Show>
          </>} />
      </div>
      </Show>
      {/* Full-screen song choice stays mounted while hidden so a draft and its
          current eligibility verdict remain available at review. */}
      <div
        aria-hidden={songSheetOpen() ? undefined : "true"}
        aria-label={songSheetTitle()}
        aria-modal="true"
        inert={!songSheetOpen()}
        class={cn(
          "fixed inset-0 z-50 overflow-hidden bg-background",
          songSheetOpen() ? "" : "pointer-events-none invisible",
        )}
        data-song-choice-screen
        role="dialog"
      >
        <ActionFooterShell
          fullViewport
          header={<MobilePageHeader class="relative z-10" title={songSheetTitle()}
            onBackClick={() => { if (enteredCapture() || file()) setSongSheetOpen(false); else props.onExit(); }} />}
          footerClass={selection() && ["ready", "checking", "measuring"].includes(songPlan().kind) ? undefined : "hidden"}
          footer={<Show when={selection() && ["ready", "checking", "measuring"].includes(songPlan().kind)}>
            <div class="mx-auto w-full max-w-md">
              <Button class="w-full" disabled={confirmingSound() || checkingPlayback() || !profileReady()}
                loading={confirmingSound() || checkingPlayback()} onClick={confirmSound} type="button">{playbackFailed() ? "Try again" : "Continue to video"}</Button>
            </div>
          </Show>}
        >
        <div class="mx-auto grid min-w-0 w-full max-w-md grid-cols-1 gap-5 p-4">
          <h1 class="sr-only">{songSheetTitle()}</h1>
          <Show when={!profileReady()}><FormNote tone="warning">Choose your active community profile before creating a video.</FormNote></Show>
          <Show when={songSheetOpen() && error()}>{message => <FormNote tone="warning">{message()}</FormNote>}</Show>
          <fieldset class="contents" disabled={captureStatus() === "recording" || finalizing()}>
          <section aria-label="Soundtrack" class="min-w-0">
            <SongExcerptComposer store={excerptStore} read={props.songReader} communityId={chosenCommunityId() || undefined}
              personaId={chosenPersonaId() || undefined}
              disabled={captureStatus() === "recording" || finalizing()}
              clipLengthMs={songLengthForClip(clipDurationMs())}
              preflight={songPreflight} initialSong={props.initialSong}
              {...(props.songPicker === undefined ? {} : { songs: props.songPicker })}
              onPlan={setSongPlan}
              onChoice={choice => { if (!disposed) {
                ++playbackCheckRevision; checkingAudio?.pause(); checkingAudio = undefined;
                setCheckingPlayback(false); setSongChoice(choice); setPlaybackFailed(false); setError("");
              } }}
              onSource={kind => { if (!disposed) setSongSource(kind); }}
              onSelection={next => {
                if (disposed) return;
                guidePreparation?.abort();
                const hadSelection = selection() !== null;
                setSelection(next);
                // A clip chosen before the song is measured now, so the duration
                // guard applies whether the song came first or second.
                const current = file();
                if (next && current && !hadSelection) void measureClip(current);
              }} />
          </section>
          </fieldset>
        </div>
        </ActionFooterShell>
      </div>
    </Show>
    <Show when={reviewVisible()}>
      <OriginalVideoReviewSurface submitting={busy()} submitLabel={busy() && submittedFromReview() ? progress().replace("video…", "video") || "Uploading video" : submittedFromReview() && record() ? "Try upload again" : "Publish video"} publishDisabled={!record() && (!profileReady() || approvedSelection() === undefined || measuring() || finalizing() || takeMismatch() || takeAlignment() === "unaligned" || clipProblem() !== undefined)} notice={(error() && record() ? "Your video couldn’t upload. Try again." : error()) || clipProblem() || (takeMismatch() ? "The song changed. Record a new video." : undefined) || (takeAlignment() === "unaligned" ? "The video couldn’t play in time with the song. Record again." : undefined)} onPublish={() => { void publish(); }}
        onBack={() => { if (record()) props.onExit(); else if (!busy()) { setFile(null); setClipDurationMs(null); clearPreviewUrls(); } }}
        preview={songActive() && songPlan().kind === "ready" && selection() && takeAlignment() !== "unaligned"
          ? <SongReviewPreview audioUrl={selection()!.audioUrl} bounds={selection()!.bounds} videoUrl={preview()}
              createAudio={props.createGuideAudio} disabled={busy()} />
          : <video src={originalPreview() ?? preview()} controls={!songActive()} playsinline class="h-full w-full object-contain" />}
        songLabel={songLabel()} onSongTap={record() ? undefined : openSongSheet}
        details={<div class="grid gap-3">
        <Show when={finalizing()}>
          <Spinner label="Preparing video" />
        </Show>
        </div>} />
    </Show>
    <Show when={record() && !reviewVisible()}>
      <ActionFooterShell class="bg-background text-foreground" fullViewport header={<MobilePageHeader class="relative z-10" title="Upload video" onBackClick={props.onExit} />}
        footer={<div class="mx-auto w-full max-w-md">
          <Show when={otherDestination()} fallback={
            <Button class="w-full" disabled={busy()} loading={busy()} onClick={() => {
              if (completedUpload()) posted();
              else if (reservationExpired() || record()?.rejection) void run(startOver);
              else void publish();
            }}>{busy() ? "Uploading" : completedUpload() ? "Home" : reservationExpired() || record()?.rejection ? "Start over" : "Try again"}</Button>
          }>
            <a class={cn(buttonVariants(), "w-full")} href={`/c/${encodeURIComponent(record()!.communityId)}`}>Open community</a>
          </Show>
        </div>}>
        <div class="mx-auto grid w-full max-w-md gap-4 p-4">
          <Show when={busy()}><Spinner label="Uploading video" /></Show>
          <p role={record()?.rejection ? "alert" : "status"}>{statusText()}</p>
        </div>
      </ActionFooterShell>
    </Show>
  </section>;
}
