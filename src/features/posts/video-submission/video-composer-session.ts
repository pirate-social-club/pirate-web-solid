import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { isServer } from "@solidjs/web";
import { createActor } from "xstate";
import { createMemoryExcerptDraftStore } from "../post-composer/song-excerpt-draft";
import type { SongSourceReader } from "../post-composer/song-excerpt-source";
import type { SongPickerSource } from "../post-composer/song-picker";
import type { FreshVideoEntry } from "../video-outcomes/fresh-composer-entry.ts";
import type { OriginalVideoCaptureInput, VideoCaptureSession } from "./capture";
import { clipFitMessage, fitClipToExcerpt } from "./clip-duration";
import { VideoCoordinator, type PendingVideo, type VideoStorage } from "./coordinator";
import type { GuideSourcePreparation } from "./buffered-guide";
import type { GuidedTakeAlignment } from "./guided-take-alignment";
import { VideoComposerMedia, type GuideAudio } from "./video-composer-media";
import { createVideoComposerMachine, type ComposerContext, type ComposerEvent, type ComposerOperations } from "./video-composer-machine";
import { createSongIntervalPreflight, type SongIntervalPreflight, songReservationRefusalText } from "./song-reference";
import { useOwnedActor } from "./solid-actor";
import { createBrowserVideoStorage } from "./storage";
import { createVideoTransport, type VideoTransport } from "./transport";

export interface VideoPostingOption {
  readonly id: string;
  readonly label: string;
  readonly communityId?: string;
}

export interface VideoComposerSessionProps {
  readonly principalId: string;
  readonly communityId?: string;
  readonly personaId?: string;
  readonly personaOptions?: readonly VideoPostingOption[];
  readonly communityName?: string;
  readonly onExit: () => void;
  readonly onRetainedPersona: (personaId: string | null, communityId?: string) => void;
  readonly onPublished?: () => void;
  readonly onPosted?: () => void;
  readonly storage?: VideoStorage;
  readonly transport?: VideoTransport;
  readonly inspectFile?: (file: File, options?: { readonly maxDurationSeconds?: number }) => Promise<File>;
  readonly measureDuration?: (file: File) => Promise<number | null>;
  readonly startCapture?: (input: OriginalVideoCaptureInput) => Promise<VideoCaptureSession>;
  readonly openPreview?: () => Promise<MediaStream>;
  readonly cameraCapture?: boolean;
  readonly createGuideAudio?: (url: string) => GuideAudio;
  readonly prepareGuideSource?: GuideSourcePreparation;
  readonly alignTake?: (file: File, offsetMs: number) => Promise<GuidedTakeAlignment>;
  readonly onGuideTiming?: (timing: { readonly startDelayMs: number }) => void;
  readonly onTakeAlignment?: (info: { readonly offsetMs: number; readonly trimmedMs: number; readonly aligned: boolean }) => void;
  readonly fetchImpl?: typeof fetch;
  readonly songPreflight?: SongIntervalPreflight;
  readonly songReader?: SongSourceReader;
  readonly songPicker?: SongPickerSource;
  readonly initialSong?: { readonly postId: string; readonly communityId?: string };
  readonly freshVideo?: FreshVideoEntry;
}

/** Solid owns this actor and only local presentation state. Its statechart
 * decides the flow; the media adapter owns handles and the coordinator owns
 * durable upload receipts and server reconciliation. */
export function useVideoComposerSession(props: VideoComposerSessionProps) {
  const freshVideo = untrack(() => props.freshVideo);
  const mobile = props.cameraCapture
    ?? Boolean(globalThis.matchMedia?.("(pointer: coarse) and (max-width: 767px)").matches);
  const excerptStore = createMemoryExcerptDraftStore();
  const songPreflight = props.songPreflight ?? createSongIntervalPreflight();
  const [chosenCommunityId, setChosenCommunityId] = createSignal(props.communityId?.trim() || "", { ownedWrite: true });
  const personasForDestination = createMemo(() => (props.personaOptions ?? [])
    .filter(option => option.communityId === undefined || option.communityId === chosenCommunityId()));
  const [chosenPersonaId, setChosenPersonaId] = createSignal(
    props.personaOptions === undefined ? props.personaId?.trim() || ""
      : personasForDestination().find(option => option.id === props.personaId?.trim())?.id || "",
    { ownedWrite: true },
  );
  const [preview, setPreview] = createSignal<string>();
  const [originalPreview, setOriginalPreview] = createSignal<string>();
  const [stream, setStream] = createSignal<MediaStream | null>(null, { ownedWrite: true });
  const [viewfinderStalled, setViewfinderStalled] = createSignal(false);
  let viewfinder: HTMLVideoElement | undefined;
  let disposed = false;
  let publishedId: string | undefined;
  let landed = false;
  let sendEvent: (event: ComposerEvent) => void = () => {};
  const showFile = (next: File) => {
    const prior = preview(); if (prior) URL.revokeObjectURL(prior);
    setPreview(URL.createObjectURL(next));
  };
  const showOriginalTake = (next: File) => {
    const prior = originalPreview(); if (prior) URL.revokeObjectURL(prior);
    setOriginalPreview(URL.createObjectURL(next));
  };
  const clearPreviewUrls = () => {
    const prior = preview(); if (prior) URL.revokeObjectURL(prior);
    const original = originalPreview(); if (original) URL.revokeObjectURL(original);
    setPreview(undefined); setOriginalPreview(undefined);
  };
  const posted = () => {
    if (landed || disposed) return;
    landed = true;
    (props.onPosted ?? (() => globalThis.location?.assign("/")))();
  };
  const coordinator = new VideoCoordinator({
    principalId: props.principalId,
    storage: props.storage ?? createBrowserVideoStorage(props.principalId),
    transport: props.transport ?? createVideoTransport(),
    fetchImpl: props.fetchImpl,
    onChange: next => {
      if (disposed) return;
      sendEvent({ type: "RECORD_CHANGED", record: next });
      props.onRetainedPersona(next?.personaId ?? null, next?.communityId);
      if (next !== null) {
        if (next.communityId && !chosenCommunityId()) setChosenCommunityId(next.communityId);
        if (next.personaId && !chosenPersonaId()) setChosenPersonaId(next.personaId);
      }
      if (next?.snapshot?.status === "published" && next.snapshot.published_resource.post_id !== publishedId) {
        publishedId = next.snapshot.published_resource.post_id;
        props.onPublished?.();
      }
    },
    onProgress: (sent, total) => {
      if (!disposed) sendEvent({ type: "PROGRESS", progress: total > 0
        ? `Uploading video… ${Math.floor((sent / total) * 100)}%` : "Uploading video…" });
    },
  });
  const media = new VideoComposerMedia({
    canCapture: () => operations.canCapture(actor.getSnapshot().context),
    openPreview: props.openPreview, startCapture: props.startCapture,
    createGuideAudio: props.createGuideAudio, prepareGuideSource: props.prepareGuideSource,
    alignTake: props.alignTake, inspectFile: props.inspectFile, measureDuration: props.measureDuration,
    onGuideTiming: props.onGuideTiming, onTakeAlignment: props.onTakeAlignment,
    onStream: setStream, onOriginalTake: showOriginalTake,
    onFailure: (reason, issue) => sendEvent({ type: "CAPTURE_FAILURE", reason, issue }),
    onLimit: () => sendEvent({ type: "CAPTURE_LIMIT" }),
    onInterrupted: () => sendEvent({ type: "INTERRUPT" }),
  });
  const approvedFor = (context: ComposerContext) => {
    const plan = context.songPlan;
    const current = context.selection;
    if (plan.kind !== "ready" || !current) return undefined;
    if (plan.selection.songPostId !== current.songPostId
      || plan.selection.clipStartSamples !== current.bounds.startMs * 48
      || plan.selection.clipDurationSamples !== (current.bounds.endMs - current.bounds.startMs) * 48) return undefined;
    return plan.selection;
  };
  const clipProblemFor = (context: ComposerContext) => {
    if (!context.takeSoundtrack && (context.clipDurationMs ?? 0) > 15_000) return "Choose a video up to 15 seconds long.";
    const fit = fitClipToExcerpt(context.clipDurationMs, context.selection?.bounds);
    return fit.kind === "too_short" || fit.kind === "too_long" ? clipFitMessage(fit) : undefined;
  };
  const takeMismatchFor = (context: ComposerContext) => {
    const take = context.takeSoundtrack;
    const current = context.selection;
    return Boolean(take && current && (take.songPostId !== current.songPostId
      || take.bounds.startMs !== current.bounds.startMs || current.bounds.endMs > take.bounds.endMs));
  };
  const profileReady = () => chosenPersonaId() !== ""
    && (props.personaOptions === undefined || personasForDestination().some(option => option.id === chosenPersonaId()));
  let previewEligibility: boolean | undefined;
  const operations: ComposerOperations = {
    async restore(signal) {
      if (freshVideo !== undefined) return { record: null, released: false, resume: false };
      const next = await coordinator.restore();
      if (signal.aborted || disposed || !next) return { record: null, released: false, resume: false };
      if (await coordinator.release()) return { record: null, released: true, resume: false };
      if (signal.aborted || disposed) return { record: null, released: false, resume: false };
      showFile(next.file);
      const resume = !next.rejection
        && (next.pending !== null || !next.snapshot || (next.snapshot.status === "processing" && next.snapshot.phase === "awaiting_upload"))
        && next.communityId === chosenCommunityId() && next.personaId === chosenPersonaId();
      return { record: next, released: false, resume };
    },
    checkPlayback: async (selection, signal) => { if (mobile) await media.checkPlayback(selection, signal); },
    inspectFile: async (file, signal) => {
      const result = await media.inspectFile(file, signal);
      if (!signal.aborted && !disposed) showFile(result.file);
      return result;
    },
    prepareGuide: (selection, signal) => media.prepareGuide(selection, signal),
    startCapture: (prepared, signal) => media.startCapture(prepared, signal),
    startGuide: (started, signal) => media.startGuide(started, signal),
    finishCapture: async (context, signal) => {
      const result = await media.finishCapture(context, signal);
      if (!signal.aborted && !disposed) showFile(result.file);
      return result;
    },
    cancelCapture: () => media.cancelCapture(),
    async publish(context, signal) {
      const retained = coordinator.current;
      if (retained && (retained.communityId !== chosenCommunityId() || retained.personaId !== chosenPersonaId())) {
        throw new Error("Your earlier video is still uploading for another community. Open that community to finish it.");
      }
      if (!retained) {
        const selected = context.file;
        if (!selected || !chosenPersonaId() || !chosenCommunityId()) throw new Error("Choose a profile and a video.");
        if (context.songChoice.kind === "none") throw new Error("Choose a song for this video.");
        if (context.songPlan.kind === "checking") throw new Error("The song is still being checked. Try again shortly.");
        const approved = approvedFor(context);
        if (!approved) throw new Error("Choose a different part of the song.");
        const impossible = clipProblemFor(context);
        if (impossible) throw new Error(impossible);
        if (takeMismatchFor(context)) throw new Error("The song changed. Record a new video.");
        if (context.takeSoundtrack && context.takeAlignment === "unaligned") {
          throw new Error("The video couldn’t play in time with the song. Record again.");
        }
        await coordinator.begin({
          communityId: chosenCommunityId(), personaId: chosenPersonaId(), file: selected,
          caption: "", rating: context.rating, song: approved,
        });
      }
      if (signal.aborted || disposed) return { posted: false };
      try { await coordinator.submit(); }
      catch (failure) {
        if (coordinator.current?.pending?.command.kind === "finalize") {
          await coordinator.settleFinalize().catch(() => false);
          return { posted: true };
        }
        const current = coordinator.current;
        const snapshot = current?.snapshot;
        const expired = snapshot?.status === "processing" && snapshot.phase === "awaiting_upload"
          && Date.parse(current?.reservation?.upload.expires_at ?? "") <= Date.now();
        if (current?.rejection || expired) return { posted: false };
        throw failure;
      }
      if (signal.aborted || disposed) return { posted: false };
      return { posted: await coordinator.release() };
    },
    async startOver() {
      const current = coordinator.current;
      if (current?.rejection) await coordinator.discardRejected();
      else {
        if ((current?.snapshot?.status === "processing" && current.snapshot.phase === "awaiting_upload")
          || (current?.snapshot?.status === "processing_failed" && current.snapshot.reason_code === "provider_submission_unconfirmed")) {
          await coordinator.revisionCommand("cancel");
        }
        await coordinator.discard();
      }
    },
    async refresh(context) {
      if (context.record?.pending?.command.kind === "finalize") return coordinator.settleFinalize().catch(() => false);
      await coordinator.refresh();
      return false;
    },
    canCapture: context => context.songChoice.kind !== "none" && context.selection !== null
      && approvedFor(context) !== undefined && chosenCommunityId() !== "" && profileReady(),
    canPublish: context => Boolean(context.record)
      || (context.file !== null && profileReady() && approvedFor(context) !== undefined
        && clipProblemFor(context) === undefined && !takeMismatchFor(context)
        && context.takeAlignment !== "unaligned"),
    shouldRefresh: context => {
      if (context.record?.pending?.command.kind === "finalize") return true;
      const state = context.record?.snapshot;
      return state?.status === "manual_review"
        || (state?.status === "processing" && state.phase !== "awaiting_upload");
    },
    onPosted: posted, onExit: props.onExit,
    onReset: () => { clearPreviewUrls(); media.closePreview(); },
    syncPreview: () => {
      if (mobile && previewEligibility) media.ensurePreview(() => !disposed && previewEligibility === true && document.visibilityState !== "hidden");
      else media.closePreview();
    },
    closePreview: () => media.closePreview(),
    discardPrepared: () => media.discardPrepared(),
  };
  const actor = createActor(createVideoComposerMachine(
    operations, isServer || document.visibilityState !== "hidden",
  ));
  sendEvent = event => queueMicrotask(() => { if (!disposed) actor.send(event); });
  const { snapshot, send } = useOwnedActor(actor);
  sendEvent = send;
  const model = () => snapshot().context;
  const inCapture = (phase: string) => {
    const value = snapshot().value;
    return typeof value === "object" && value !== null && value.capture === phase;
  };
  const record = () => model().record;
  const file = () => model().file;
  const submittedFromReview = () => model().submittedFromReview;
  const rating = () => model().rating;
  const busy = () => snapshot().matches("restoring") || snapshot().matches("checkingPlayback")
    || snapshot().matches("submitting") || snapshot().matches("startingOver")
    || inCapture("preparingGuide") || inCapture("startingCapture") || inCapture("startingGuide") || inCapture("inspecting");
  const error = () => model().error;
  const progress = () => model().progress;
  const captureStatus = () => inCapture("recording") || inCapture("startingGuide") ? "recording" : model().issue ?? "idle";
  const selection = () => model().selection;
  const clipDurationMs = () => model().clipDurationMs;
  const measuring = () => inCapture("inspecting");
  const finalizing = () => inCapture("finalizing");
  const songPlan = () => model().songPlan;
  const songChoice = () => model().songChoice;
  const songSource = () => model().songSource;
  const songSheetOpen = () => snapshot().matches("choosingSong") || snapshot().matches("checkingPlayback");
  const enteredCapture = () => model().enteredCapture;
  const takeSoundtrack = () => model().takeSoundtrack;
  const takeAlignment = () => model().takeAlignment;
  const confirmingSound = () => model().confirmRequested;
  const checkingPlayback = () => snapshot().matches("checkingPlayback");
  const playbackFailed = () => model().playbackFailed;
  const pageVisible = () => model().visible;
  const panelShown = () => captureStatus() !== "idle" && captureStatus() !== "recording";
  const songActive = () => songChoice().kind !== "none";
  const songSheetTitle = () => songSource() === "ready"
    && !["refused", "ineligible", "not_available", "timing_unavailable"].includes(songPlan().kind) ? "Song" : "Choose a song";
  const songLabel = () => songActive() && selection() ? selection()!.title : undefined;
  const approvedSelection = () => approvedFor(model());
  const clipProblem = () => clipProblemFor(model());
  const takeMismatch = () => takeMismatchFor(model());
  const interactionBusy = () => busy() || finalizing();
  const state = () => record()?.snapshot;
  const editing = () => !record();
  const awaiting = () => { const current = state(); return current?.status === "processing" && current.phase === "awaiting_upload"; };
  const uploadExpired = (current: PendingVideo | null) => {
    const currentState = current?.snapshot;
    return currentState?.status === "processing" && currentState.phase === "awaiting_upload"
      && Date.parse(current?.reservation?.upload.expires_at ?? "") <= Date.now();
  };
  const reservationExpired = () => uploadExpired(record());
  const otherDestination = () => record() !== null
    && (record()!.communityId !== chosenCommunityId() || record()!.personaId !== chosenPersonaId());
  const reviewVisible = () => file() !== null && (editing()
    || (submittedFromReview() && !record()?.rejection && !reservationExpired()));
  const completedUpload = () => record()?.pending?.command.kind === "finalize"
    || (!awaiting() && state() !== undefined && !record()?.rejection);
  const statusText = () => {
    if (otherDestination()) return "Finish this upload in the community where you started it.";
    if (record()?.rejection) return songReservationRefusalText(record()?.rejection?.reasonCode) ?? "This video wasn’t accepted.";
    if (reservationExpired()) return error() ? "Couldn’t start over. Try again." : "This upload expired.";
    if (completedUpload()) return "Your video has uploaded.";
    if (busy()) return progress() || "Uploading video…";
    return "Your video couldn’t upload. Try again.";
  };
  const openSongSheet = () => send({ type: "OPEN_SONG" });
  const confirmSound = () => send({ type: "CONTINUE" });
  const chooseFile = (next?: File) => { if (next) send({ type: "FILE", file: next }); };
  const toggleCapture = () => send({ type: inCapture("recording") || inCapture("startingGuide") ? "STOP" : "RECORD" });
  const publish = () => send({ type: "PUBLISH" });
  const playLive = (element: HTMLVideoElement) => {
    void element.play()?.then(() => setViewfinderStalled(false), () => setViewfinderStalled(true));
  };
  const showLive = (element: HTMLVideoElement, mediaStream: MediaStream | null) => {
    if (element.srcObject !== mediaStream) element.srcObject = mediaStream;
    if (mediaStream && element.paused) playLive(element);
  };
  const bindViewfinder = (element: HTMLVideoElement) => { viewfinder = element; showLive(element, untrack(stream)); };
  createEffect(() => stream(), mediaStream => {
    if (viewfinder && viewfinder.isConnected) showLive(viewfinder, mediaStream);
  });
  const previewWanted = () => mobile && (inCapture("idle") || inCapture("preparingGuide") || inCapture("startingCapture"))
    && operations.canCapture(model()) && pageVisible() && !record() && !file() && captureStatus() === "idle";
  createEffect(() => previewWanted(), wanted => {
    if (wanted === previewEligibility) return;
    previewEligibility = wanted;
    send({ type: "PREVIEW_CHECK" });
  });
  const onVisibilityChange = () => send({ type: "VISIBILITY", visible: document.visibilityState !== "hidden" });
  if (!isServer) document.addEventListener("visibilitychange", onVisibilityChange);
  onCleanup(() => {
    disposed = true;
    coordinator.pauseUpload(); media.dispose(); clearPreviewUrls();
    if (!isServer) document.removeEventListener("visibilitychange", onVisibilityChange);
  });
  return {
    mobile, excerptStore, songPreflight, personasForDestination, chosenCommunityId, chosenPersonaId,
    preview, originalPreview, stream, viewfinderStalled, bindViewfinder, playLive, showLive,
    record, file, submittedFromReview, rating, busy, error, progress, captureStatus, selection,
    clipDurationMs, measuring, finalizing, songPlan, songChoice, songSource, songSheetOpen,
    enteredCapture, takeSoundtrack, takeAlignment, confirmingSound, checkingPlayback, playbackFailed,
    panelShown, songActive, songSheetTitle, songLabel, approvedSelection, clipProblem, takeMismatch,
    profileReady, interactionBusy, state, editing, awaiting, reservationExpired, otherDestination,
    reviewVisible, completedUpload, statusText, posted, clearPreviewUrls,
    openSongSheet, confirmSound, chooseFile, toggleCapture, publish, send,
  };
}
