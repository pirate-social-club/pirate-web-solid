/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { originalSongPostId } from "../song-submission/original-song-link";
import { createEffect, createSignal, getOwner, onCleanup, Show, untrack } from "solid-js";

import type { ActivePersonaPublicProjection } from "../../../api/session";
import {
  Button,
  FormNote,
  TextField,
  TextFieldDescription,
  TextFieldInput,
  TextFieldLabel,
  Type,
} from "../../../design-system";
import type { MediaSubmissionSnapshot } from "../media-submission/contracts";
import { createMediaSubmissionCoordinator } from "../media-submission/coordinator";
import { projectMediaSubmission, type SongSubmissionView } from "../media-submission/projection";
import type { MediaSubmissionTransport } from "../media-submission/transport";
import { royaltySplitIssue } from "./earnings-split";
import {
  prepareSongComposer,
  projectSnapshotIntoSongComposer,
  submitComposerLyrics,
  submitSongComposer,
} from "./media-composer-bridge";
import { DEFAULT_SONG_LICENSE } from "./defaults";
import { PostComposer } from "./post-composer";
import type { FreshVideoEntry } from "../video-outcomes/fresh-composer-entry.ts";
import { VideoComposerRuntime } from "../video-submission/video-composer-runtime";
import type { OriginalVideoCaptureInput, VideoCaptureSession } from "../video-submission/capture";
import type { SongIntervalPreflight } from "../video-submission/song-reference";
import type { SongSourceReader } from "./song-excerpt-source";
import { useSongSubmissionStore, type SongSubmissionStore } from "../song-submission/song-submission-store.tsx";
import { extractEmbeddedAudioArtworkFile, extractEmbeddedAudioTitle } from "./audio-artwork";
import { titleFromFilename } from "./write-step";
import type {
  AssetLicenseState,
  AssetRoyaltySplitState,
  AuthorAgeGatePolicy,
  ComposerTab,
  SongComposerState,
  SongMode,
} from "./types";

export interface PostCommunityContext {
  readonly id: string;
  readonly name: string;
}

export function initialOperationPersonaId(
  personas: readonly ActivePersonaPublicProjection[],
  preferredPersonaId?: string,
): string | undefined {
  return personas.find(persona => persona.personaId === preferredPersonaId)?.personaId
    ?? personas[0]?.personaId;
}

function terminalMediaView(view: SongSubmissionView): boolean {
  return view.status === "published" || view.status === "blocked" || view.status === "abandoned";
}


function mediaStateMessage(view: SongSubmissionView): string {
  switch (view.status) {
    case "editing": return "Ready to submit your song.";
    case "reconciling": return "Checking on your song…";
    case "uploading": return view.bytesTotal > 0
      ? `Uploading audio… ${Math.min(100, Math.floor((view.bytesSent / view.bytesTotal) * 100))}%`
      : "Uploading audio…";
    case "processing": return "Your song is processing. This can take a minute.";
    case "action_required": return "This song needs the original song it's based on before it can continue.";
    case "manual_review": return "This song is awaiting manual review.";
    case "published": return "Song published.";
    case "blocked": return "This song was blocked by policy.";
    case "processing_failed": return "Song processing failed.";
    case "abandoned": return "This song submission was cancelled.";
  }
}

export interface CreatePostDialogProps {
  readonly communityContext?: PostCommunityContext;
  /** Entering from a song post: open on the video track with this song chosen
   * before capture. */
  readonly initialVideoSong?: { readonly postId: string };
  readonly freshVideo?: FreshVideoEntry;
  /** Open straight on the song steps or the video capture flow. */
  readonly initialMode?: "song" | "video";
  /** The audio file chosen before the song steps opened. */
  readonly initialSongFile?: File;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPublished?: (href?: string) => void;
  /** A submitted song was handed to the submission owner for this community. */
  readonly onSongSubmitted?: (communityId: string) => void;
  /** The owner a submitted song is handed to when the host has no application
   * shell to supply one, as in an isolated page render. */
  readonly songStore?: SongSubmissionStore;
  readonly personaId?: string;
  readonly principalId?: string;
  readonly personas?: readonly ActivePersonaPublicProjection[];
  readonly mediaTransport?: MediaSubmissionTransport;
  readonly videoStorage?: import("../video-submission/coordinator").VideoStorage;
  readonly videoTransport?: import("../video-submission/transport").VideoTransport;
  /** The interval preflight standing in for the server's excerpt checks in
   * stories and tests; production leaves it to the runtime's own client. */
  readonly videoSongPreflight?: SongIntervalPreflight;
  /** The song source read standing in for the song playback grant. */
  readonly videoSongReader?: SongSourceReader;
  /** The picker's song list standing in for the community feed. */
  readonly videoSongPicker?: import("./song-picker").SongPickerSource;
  /** The take alignment standing in for the guided-take trim. */
  readonly videoAlignTake?: (file: File, offsetMs: number) => Promise<import("../video-submission/guided-take-alignment").GuidedTakeAlignment>;
  /** The camera preview standing in for a device camera, so stories can
   * show the settled capture surface rather than a permission failure. */
  readonly videoOpenPreview?: () => Promise<MediaStream>;
  /** The capture session standing in for a real recording. */
  readonly videoStartCapture?: (input: OriginalVideoCaptureInput) => Promise<VideoCaptureSession>;
  readonly createMediaId?: () => string;
  readonly origin?: string | URL;
  readonly fetchImpl?: typeof fetch;
}

/**
 * One composer session per open. The session owns its coordinators and draft
 * state, so closing the composer destroys everything it held; nothing survives
 * to the next open. An unresolved request is the exception: it must be
 * reconciled or reach a terminal outcome before the session may close, because
 * abandoning it would lose the only record that prevents a duplicate post.
 */
export function CreatePostDialog(props: CreatePostDialogProps): JSX.Element {
  return (
    <Show when={props.open}>
      <CreatePostDialogSession {...props} />
    </Show>
  );
}

function CreatePostDialogSession(props: CreatePostDialogProps): JSX.Element {
  const personas = () => props.personas ?? [];
  const initialPersonaId = untrack(() => initialOperationPersonaId(personas(), props.personaId));
  const contextualCommunityId = () => props.communityContext?.id.trim() ?? "";
  let disposed = false;
  const [communityId, setCommunityId] = createSignal(contextualCommunityId());
  const [title, setTitle] = createSignal(untrack(() => props.initialMode === "song" && props.initialSongFile
    ? titleFromFilename(props.initialSongFile.name)
    : ""));
  const [songAgeGatePolicy, setSongAgeGatePolicy] = createSignal<AuthorAgeGatePolicy>("none");
  const [mode, setMode] = createSignal<"song" | "video">(
    untrack(() => ((props.initialVideoSong || props.freshVideo) ? "video" : props.initialMode ?? "song")),
  );
  const [songMode, setSongMode] = createSignal<SongMode>("original");
  // Discarding a retained song also starts its steps from the beginning.
  const [songDraftVersion, setSongDraftVersion] = createSignal(1);
  const initialSongFile = untrack(() => props.initialMode === "song" ? props.initialSongFile : undefined);
  const [song, setSong] = createSignal<SongComposerState>(initialSongFile === undefined ? {
    title: "",
    primaryAudioUpload: null,
    lyricsEditorState: "hidden",
  } : {
    title: titleFromFilename(initialSongFile.name),
    primaryAudioUpload: initialSongFile,
    primaryAudioLabel: initialSongFile.name,
    lyricsEditorState: "hidden",
  });
  if (initialSongFile !== undefined) {
    // The same reading the write step does for a picked file: the embedded
    // title and cover replace the filename guess when the file carries them.
    void Promise.all([extractEmbeddedAudioTitle(initialSongFile), extractEmbeddedAudioArtworkFile(initialSongFile)]).then(
      ([embeddedTitle, embeddedArtwork]) => {
        if (disposed) return;
        setSong(current => current.primaryAudioUpload !== initialSongFile ? current : {
          ...current,
          title: embeddedTitle ?? current.title,
          coverUpload: embeddedArtwork,
          coverLabel: embeddedArtwork?.name,
          coverSource: embeddedArtwork ? "embedded" : undefined,
        });
        if (embeddedTitle) setTitle(embeddedTitle);
      },
      () => undefined,
    );
  }
  const [lyrics, setLyrics] = createSignal("");
  let lyricsEdited = false;
  const [license, setLicense] = createSignal<AssetLicenseState>(DEFAULT_SONG_LICENSE);
  const [royaltySplit, setRoyaltySplit] = createSignal<AssetRoyaltySplitState>({
    allocations: initialPersonaId === undefined ? [] : [{
      id: "creator",
      recipientKind: "creator",
      recipientId: initialPersonaId,
      shareBps: 10_000,
      sharePct: 100,
    }],
  }, { ownedWrite: true });
  const [songPersonaId, setSongPersonaId] = createSignal<string | undefined>(
    initialPersonaId,
    { ownedWrite: true },
  );
  const [videoPersonaId, setVideoPersonaId] = createSignal<string | undefined>(untrack(() => props.personaId?.trim() || undefined), { ownedWrite: true });
  const selectedPersonaId = () => mode() === "video" ? videoPersonaId() : songPersonaId();
  const recipientProfiles = () => personas().map(persona => ({
    personaId: persona.personaId,
    displayName: persona.displayName ?? persona.primaryPublicHandle ?? "Profile",
    handle: persona.primaryPublicHandle,
    avatarSrc: persona.avatarRef,
  }));
  const [error, setError] = createSignal("");
  const [uploadFailure, setUploadFailure] = createSignal<string | null>(null);
  const [mediaView, setMediaView] = createSignal<SongSubmissionView>({ status: "editing" });
  const [mediaSnapshot, setMediaSnapshot] = createSignal<MediaSubmissionSnapshot | null>(null);
  const [mediaBusy, setMediaBusy] = createSignal(false);
  const [lyricsBusy, setLyricsBusy] = createSignal(false);
  const mediaEnabled = props.principalId !== undefined && personas().length > 0;
  let mediaOperationInFlight = false;
  let mediaUploadController: AbortController | undefined;
  let finishingPublishedSong = false;

  const songStore = useSongSubmissionStore() ?? untrack(() => props.songStore) ?? null;
  // The coordinator stops writing this dialog's state after handover.
  let handedOver = false;
  const mediaCoordinator = !mediaEnabled ? undefined : createMediaSubmissionCoordinator({
    transport: props.mediaTransport,
    createId: props.createMediaId,
    origin: props.origin,
    fetchImpl: props.fetchImpl,
    onStateChange: (view) => { if (!handedOver) setMediaView(view); },
    onSnapshotChange: (snapshot) => { if (!handedOver) applySnapshot(snapshot); },
  });

  function applySnapshot(snapshot: MediaSubmissionSnapshot): void {
    setMediaSnapshot(snapshot);
    const projection = projectSnapshotIntoSongComposer(snapshot);
    setSong(current => ({ ...current, ...projection.song }));
    if (projection.lyricsValue !== undefined && !lyricsEdited) setLyrics(projection.lyricsValue);
    if (snapshot.status === "published" && !mediaOperationInFlight) void finishSongPublished();
  }

  // The composer inherits the community's active profile whenever it opens on
  // a fresh operation. An unresolved submission in this dialog session keeps
  // the author it was already sent under; a request is never re-keyed to a
  // different profile after dispatch.
  createEffect(
    () => [props.open, props.personaId, props.personas] as const,
    ([open]) => {
      if (!open) return;
      const nextPersonaId = initialOperationPersonaId(personas(), props.personaId);
      if (mediaCoordinator?.currentRecord == null) selectSongPersona(nextPersonaId);
      if (untrack(mode) !== "video" || untrack(videoPersonaId) === undefined) setVideoPersonaId(props.personaId?.trim() || undefined);
    },
  );

  function changeMode(next: ComposerTab): void {
    if (next === "song" || next === "video") setMode(next);
    else close(false);
  }

  function selectSongPersona(nextPersonaId: string | undefined): void {
    const previousPersonaId = songPersonaId();
    setRoyaltySplit(current => {
      if (current.allocations.length === 0 && nextPersonaId !== undefined) {
        return {
          allocations: [{
            id: "creator",
            recipientKind: "creator",
            recipientId: nextPersonaId,
            shareBps: 10_000,
            sharePct: 100,
          }],
        };
      }
      return {
        allocations: current.allocations.map(allocation => allocation.recipientKind === "creator"
          && (allocation.recipientId === previousPersonaId || allocation.recipientId === undefined)
          ? { ...allocation, recipientId: nextPersonaId }
          : allocation),
      };
    });
    setSongPersonaId(nextPersonaId);
  }

  function resetSongDraft(): void {
    setMode("song");
    setSongMode("original");
    setSong({ title: "", primaryAudioUpload: null, lyricsEditorState: "hidden" });
    setLyrics("");
    lyricsEdited = false;
    setLicense(DEFAULT_SONG_LICENSE);
    const nextPersonaId = initialOperationPersonaId(personas(), props.personaId);
    setRoyaltySplit({
      allocations: nextPersonaId === undefined ? [] : [{
        id: "creator",
        recipientKind: "creator",
        recipientId: nextPersonaId,
        shareBps: 10_000,
        sharePct: 100,
      }],
    });
    setSongPersonaId(nextPersonaId);
    setMediaSnapshot(null);
    setMediaView({ status: "editing" });
    observationCount = 0;
    setObservationPaused(false);
    setTitle("");
    setSongAgeGatePolicy("none");
    setError("");
    setUploadFailure(null);
    setSongDraftVersion(version => version + 1);
  }

  function discardTerminalSong(): void {
    mediaCoordinator?.discardTerminal();
    resetSongDraft();
  }

  /** Returns false when an outstanding song command kept the composer open. */
  function close(open: boolean): boolean {
    if (!open) {
      // Only an outstanding request keeps the composer open. A processing or
      // manual-review state is a known server response the author cannot act
      // on, so it must not trap them here.
      const view = mediaView();
      if (mediaBusy() || view.status === "uploading" || view.status === "reconciling") {
        setError("This song submission still has an unresolved command. Resolve it before closing.");
        return false;
      }
    }
    props.onOpenChange(open);
    return true;
  }

  /**
   * The server has accepted the song. Everything left is the server's work, so
   * the steps end here: the application's song owner watches it from now on
   * and the author sees it in the feed. Without that owner, as in an isolated
   * render, the song stays in this dialog as before.
   */
  function handOverSong(snapshot: MediaSubmissionSnapshot, personaId: string, community: string): boolean {
    if (songStore === null || mediaCoordinator === undefined || props.principalId === undefined) return false;
    if (!mediaCoordinator.termsIssued) return false;
    const coordinator = mediaCoordinator;
    const persona = personas().find(candidate => candidate.personaId === personaId);
    songStore.adopt({
      submissionId: snapshot.submission_id,
      accountId: props.principalId,
      communityId: community,
      title: song().title ?? title(),
      authorHandle: persona?.displayName ?? persona?.primaryPublicHandle ?? undefined,
      authorAvatarSrc: persona?.avatarRef ?? null,
      view: projectMediaSubmission(snapshot),
      source: { refresh: signal => coordinator.refresh(signal), retry: signal => coordinator.retry(signal), bindOriginal: async (link, signal) => coordinator.bindReference(await originalSongPostId(link, signal), signal) },
    });
    handedOver = true;
    props.onOpenChange(false);
    props.onSongSubmitted?.(community);
    return true;
  }

  function finishSongPublished(): void {
    const snapshot = mediaSnapshot();
    if (finishingPublishedSong || mediaCoordinator?.currentRecord == null
      || snapshot?.status !== "published") return;
    const href = snapshot.published_resource.href;
    finishingPublishedSong = true;
    try {
      discardTerminalSong();
      props.onOpenChange(false);
      props.onPublished?.(href);
    } finally {
      finishingPublishedSong = false;
    }
  }

  function selectedActivePersonaId(): string | undefined {
    const selected = selectedPersonaId();
    return selected !== undefined && personas().some(persona => persona.personaId === selected)
      ? selected
      : undefined;
  }

  async function submitSong(prepareOnly = false): Promise<boolean> {
    if (mediaBusy() || lyricsBusy()) return false;
    const personaId = selectedActivePersonaId();
    const community = communityId().trim();
    if (mediaCoordinator === undefined || props.principalId === undefined) {
      setError("An authenticated account is required to submit a song.");
      return false;
    }
    if (personaId === undefined) {
      setError(personas().length === 0
        ? "Choose a profile for this community before posting."
        : "This profile cannot post here. Choose another profile and try again.");
      return false;
    }
    if (community === "") {
      setError("Choose a community before publishing.");
      return false;
    }
    setError("");
    setMediaBusy(true);
    mediaOperationInFlight = true;
    const uploadController = new AbortController();
    mediaUploadController = uploadController;
    try {
      const snapshot = await (prepareOnly ? prepareSongComposer : submitSongComposer)({
        coordinator: mediaCoordinator,
        communityId: community,
        personaId,
        song: song(),
        lyrics: lyrics(),
        songMode: songMode(),
        license: license(),
        royaltySplit: royaltySplit(),
        authorDeclaredRating: songAgeGatePolicy() === "18_plus" ? "adult_18" : "general",
        signal: uploadController.signal,
      });
      applySnapshot(snapshot);
      setUploadFailure(null);
      // With an owner to take it, a submitted song always goes to the feed,
      // published already or not, and the author is taken nowhere.
      if (!prepareOnly && !handOverSong(snapshot, personaId, community) && snapshot.status === "published") finishSongPublished();
      return snapshot.audio_revision >= 1;
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : "The song could not be submitted safely.";
      setError(message);
      if (prepareOnly && canCancelSong() && Boolean(song().primaryAudioUpload)
        && !mediaCoordinator.recoveredUploadUnavailable) setUploadFailure(message);
      return false;
    } finally {
      if (mediaUploadController === uploadController) mediaUploadController = undefined;
      mediaOperationInFlight = false;
      setMediaBusy(false);
    }
  }

  function stopSongUpload(): void {
    mediaUploadController?.abort(new DOMException("Upload stopped", "AbortError"));
  }

  async function refreshSong(automatic = false): Promise<void> {
    if (mediaCoordinator?.currentRecord?.submission_id == null || mediaBusy() || lyricsBusy()) return;
    if (!automatic) {
      observationCount = 0;
      observationFailures = 0;
      observationRetryAt = 0;
      setObservationPaused(false);
    }
    setError("");
    setMediaBusy(true);
    try {
      const snapshot = await mediaCoordinator.refresh();
      if (snapshot !== null) applySnapshot(snapshot);
      observationFailures = 0;
      observationRetryAt = 0;
    } catch (refreshError) {
      if (automatic) {
        // A transient status failure must not strand a submission that later
        // publishes: back off and keep checking until a bounded run of
        // consecutive failures pauses observation for a manual retry.
        observationFailures += 1;
        observationRetryAt = Date.now() + Math.min(30_000, 3_000 * 2 ** (observationFailures - 1));
        if (observationFailures >= 5) setObservationPaused(true);
      }
      setError(refreshError instanceof Error ? refreshError.message : "The song status is still uncertain.");
    } finally {
      setMediaBusy(false);
    }
  }

  async function saveLyrics(): Promise<void> {
    const snapshot = mediaSnapshot();
    if (mediaCoordinator === undefined || snapshot === null) return;
    setError("");
    setLyricsBusy(true);
    try {
      applySnapshot(await submitComposerLyrics(mediaCoordinator, snapshot, lyrics()));
      lyricsEdited = false;
    } catch (lyricsError) {
      setError(lyricsError instanceof Error ? lyricsError.message : "The reviewed lyrics could not be saved safely.");
    } finally {
      setLyricsBusy(false);
    }
  }

  async function retrySong(): Promise<void> {
    if (mediaCoordinator === undefined) return;
    setError("");
    setMediaBusy(true);
    try {
      applySnapshot(await mediaCoordinator.retry());
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Song processing could not be retried safely.");
    } finally {
      setMediaBusy(false);
    }
  }

  async function cancelSong(): Promise<void> {
    if (mediaCoordinator === undefined) return;
    setError("");
    setMediaBusy(true);
    try {
      applySnapshot(await mediaCoordinator.cancel());
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "The song could not be cancelled safely.");
    } finally {
      setMediaBusy(false);
    }
  }

  async function cancelFailedUpload(): Promise<void> {
    await cancelSong();
    if (mediaView().status === "abandoned") discardTerminalSong();
    else if (error()) setUploadFailure(error());
  }

  function submit(): void {
    if (mode() === "song") void submitSong();
  }

  const songTermsIssued = () => {
    // currentRecord is not reactive. Every coordinator command path must apply
    // its snapshot so this dependency invalidates after retained commands change.
    mediaSnapshot();
    return mediaCoordinator?.termsIssued ?? false;
  };
  let observationCount = 0;
  let observationFailures = 0;
  let observationRetryAt = 0;
  const [observationPaused, setObservationPaused] = createSignal(false);
  const observation = typeof window !== "undefined" && getOwner() ? setInterval(() => {
    if (disposed || !props.open || mode() !== "song" || mediaBusy() || lyricsBusy()
      || observationPaused()) return;
    const view = mediaView();
    if (view.status !== "processing"
      && view.status !== "manual_review"
      && (view.status !== "processing_failed" || view.retryable)) return;
    if (mediaCoordinator?.currentRecord?.submission_id == null) return;
    if (Date.now() < observationRetryAt) return;
    if (++observationCount > 200) { setObservationPaused(true); return; }
    void refreshSong(true);
  }, 3_000) : undefined;
  onCleanup(() => {
    disposed = true;
    if (observation !== undefined) clearInterval(observation);
    mediaUploadController?.abort(new DOMException("Composer closed", "AbortError"));
  });

  const canContinueSongSubmit = () => {
    const view = mediaView();
    return view.status === "editing"
      || view.status === "reconciling"
      || (view.status === "processing" && !songTermsIssued());
  };
  const songSubmitDisabled = () => mediaBusy()
    || lyricsBusy()
    || !canContinueSongSubmit()
    || selectedActivePersonaId() === undefined
    || communityId().trim() === ""
    || royaltySplitIssue(royaltySplit(), selectedActivePersonaId()) !== "";
  const lyricsCanSave = () => {
    const snapshot = mediaSnapshot();
    if (snapshot === null
      || snapshot.audio_revision < 1
      || snapshot.status === "published"
      || snapshot.status === "blocked"
      || snapshot.status === "abandoned"
      || lyrics().length === 0
      || lyricsBusy()) return false;
    const current = snapshot.lyrics_state.current;
    return current.status === "not_bound" || (current.status === "ready" && current.text !== lyrics());
  };
  const canCancelSong = () => {
    const view = mediaView();
    return view.status === "processing" && view.phase === "awaiting_upload";
  };
  const showUploadRecovery = () => mode() === "song" && uploadFailure() !== null && canCancelSong();
  const canRetrySong = () => {
    const view = mediaView();
    return view.status === "processing_failed" && view.retryable;
  };

  // Where an in-flight song is: before the upload finishes it is Song, and
  // once audio is accepted and terms are issued only Review remains.
  const initialSongStep = (): 1 | 2 | 3 => {
    const snapshot = mediaSnapshot();
    if (snapshot === null || snapshot.audio_revision < 1) return 1;
    if (songTermsIssued()) return 3;
    return 2;
  };

  // After Continue on the Song step the audio is uploaded and the author is
  // still editing Rights and Review; that is not a state worth a status card.
  const preparedDraft = () => Boolean(mediaSnapshot()?.audio_revision) && !songTermsIssued() && mediaView().status === "processing";

  /** How much of the audio has been sent, once the size is known. */
  const uploadFraction = (): number | undefined => {
    const view = mediaView();
    return view.status === "uploading" && view.bytesTotal > 0
      ? Math.min(1, view.bytesSent / view.bytesTotal)
      : undefined;
  };

  const mediaStatusPanel = () => (
    <Show when={mode() === "song" && mediaView().status !== "editing" && !preparedDraft()}>
      <div
        aria-live="polite"
        class="grid gap-3 rounded-2xl border border-border-soft bg-card p-5 text-base"
        data-media-composer-state={mediaView().status}
        role={mediaView().status === "blocked" || mediaView().status === "processing_failed" ? "alert" : "status"}
      >
        <p>{mediaStateMessage(mediaView())}</p>
        <Show when={mediaView().status === "uploading"}>
          <div
            aria-label="Audio upload"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={uploadFraction() === undefined ? undefined : Math.floor(uploadFraction()! * 100)}
            class="h-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
          >
            <div class="h-full rounded-full bg-primary" style={{ width: uploadFraction() === undefined ? "25%" : `${Math.floor(uploadFraction()! * 100)}%` }} />
          </div>
        </Show>
        <Show when={mediaView().status === "uploading"}>
          <Button type="button" variant="outline" onClick={stopSongUpload}>Stop upload</Button>
        </Show>
        <Show when={mediaSnapshot() !== null && mediaCoordinator?.recoveredUploadUnavailable}>
          <FormNote tone="warning">The original audio file and upload reservation are no longer available. Cancel this song submission and start again.</FormNote>
        </Show>
        <Show when={canCancelSong()}>
          <Button disabled={mediaBusy()} type="button" variant="ghost" onClick={() => void cancelSong()}>Cancel song submission</Button>
        </Show>
        <Show when={canRetrySong()}>
          <Button disabled={mediaBusy()} type="button" variant="outline" onClick={() => void retrySong()}>Retry processing</Button>
        </Show>
        <Show when={lyricsCanSave()}>
          <Button disabled={lyricsBusy()} type="button" onClick={() => void saveLyrics()}>Save reviewed lyrics</Button>
        </Show>
        <Show when={(terminalMediaView(mediaView()) && mediaView().status !== "published")
          || mediaView().status === "processing_failed"}>
          <Button disabled={mediaBusy()} type="button" variant="outline" onClick={() => discardTerminalSong()}>Discard and start over</Button>
        </Show>
      </div>
    </Show>
  );

  // The video flow is its own full-screen capture experience — close, sound
  // and record on one screen, posting details at review — not a tab inside
  // the scrolling post form. It replaces the form entirely while it runs.
  return (
    <Show
      when={mode() === "video"}
      fallback={
      <form
        aria-label="Post a song"
        class="fixed inset-0 z-50 overflow-y-auto bg-background px-3 py-4 sm:px-6 sm:py-8"
        data-create-post-form
        onSubmit={event => event.preventDefault()}
      >
      <div class="mx-auto grid w-full max-w-3xl gap-3">
            <Show when={!props.communityContext}>
              <TextField name="community-id" value={communityId()} onChange={setCommunityId}>
                <TextFieldLabel>Community ID</TextFieldLabel>
                <TextFieldInput autocomplete="off" placeholder="The community identifier" />
                <TextFieldDescription>Posts are community-scoped. A friendly community picker will replace this field.</TextFieldDescription>
              </TextField>
            </Show>
            <Show when={personas().length === 0}>
              <FormNote tone="warning">Choose a profile for this community before posting.</FormNote>
            </Show>
              <Show when={!showUploadRecovery()} fallback={
                <section aria-labelledby="upload-recovery-title" class="mx-auto flex min-h-[calc(100dvh-2rem)] w-full max-w-md flex-col px-2 pb-4">
                  <div class="flex justify-end"><Button disabled={mediaBusy()} onClick={() => close(false)} type="button" variant="ghost">Close</Button></div>
                  <div class="flex flex-1 flex-col justify-center gap-5">
                    <div class="space-y-2">
                      <Type as="h2" id="upload-recovery-title" variant="h2">Audio upload needs another try</Type>
                      <Type class="text-muted-foreground">Your song has not been published.</Type>
                    </div>
                    <div aria-live="polite" role="alert"><FormNote tone="warning">{uploadFailure()}</FormNote></div>
                    <Show when={song().primaryAudioUpload?.name}>{name => <Type class="break-all text-muted-foreground">Selected file: {name()}</Type>}</Show>
                  </div>
                  <div class="grid gap-2 pb-[env(safe-area-inset-bottom)]">
                    <Button disabled={mediaBusy()} loading={mediaBusy()} onClick={() => void submitSong(true)} type="button">Try upload again</Button>
                    <Button disabled={mediaBusy()} onClick={() => void cancelFailedUpload()} type="button" variant="ghost">Cancel song submission</Button>
                  </div>
                </section>
              }>
              <Show when={songDraftVersion()} keyed>{_version => <PostComposer
                attachmentBarPlacement="inline"
                audienceEditingDisabled={mode() === "song"
                  ? mediaSnapshot() !== null || mediaBusy()
                  : false}
                availableCapabilities={["song", "video"]}
                canCreateSongPost={personas().length > 0}
                currentPersonaId={selectedPersonaId()}
                initialSongStep={initialSongStep()}
                license={license()}
                lyricsValue={lyrics()}
                mediaStatus={mediaStatusPanel}
                mode={mode()}
                onClose={() => close(false)}
                onLicenseChange={setLicense}
                onAgeGatePolicyChange={setSongAgeGatePolicy}
                onLyricsValueChange={value => { lyricsEdited = true; setLyrics(value); }}
                onModeChange={changeMode}
                onVideoEntry={() => { setVideoPersonaId(props.personaId?.trim() || undefined); setMode("video"); }}
                onRoyaltySplitChange={setRoyaltySplit}
                onSongChange={next => {
                  setSong(next);
                  if (next.title !== undefined) setTitle(next.title);
                }}
                onSongModeChange={setSongMode}
                onTitleValueChange={value => {
                  setTitle(value);
                  if (mode() === "song") setSong(current => ({ ...current, title: value }));
                }}
                recipientProfiles={recipientProfiles()}
                songFlowRuntime={mode() === "song" ? {
                  personaId: selectedActivePersonaId(),
                  prepare: () => submitSong(true),
                  prepared: (mediaSnapshot()?.audio_revision ?? 0) >= 1,
                  retained: mediaSnapshot() !== null,
                  locked: mediaBusy() || lyricsBusy() || songTermsIssued() || terminalMediaView(mediaView()),
                } : undefined}
                ageGatePolicy={songAgeGatePolicy()}
                royaltySplit={royaltySplit()}
                song={song()}
                songMode={songMode()}
                submit={{
                  get disabled() { return songSubmitDisabled(); },
                  get error() { return error() || null; },
                  label: "Post song",
                  get loading() { return mode() === "song" ? mediaBusy() : false; },
                  onSubmit: submit,
                }}
                titleValue={title()}
                validateDraftBeforeSubmit
              />}</Show>
              </Show>
        </div>
      </form>
      }
    >
      <div class="fixed inset-0 z-[60] overflow-y-auto bg-black" data-create-video-overlay>
      <Show
        when={props.principalId}
        fallback={
          <div class="fixed inset-0 z-50 grid place-items-center bg-background p-6" data-create-video-signed-out>
            <FormNote tone="warning">Sign in to post a video.</FormNote>
          </div>
        }
      >
        {account => (
          <VideoComposerRuntime
            principalId={account()}
            communityId={communityId().trim() || undefined}
            communityName={props.communityContext?.name}
            personaId={videoPersonaId()}
            personaOptions={personas().map(persona => ({
              id: persona.personaId,
              label: persona.displayName ?? persona.primaryPublicHandle ?? "Profile",
            }))}
            initialSong={props.initialVideoSong}
            freshVideo={props.freshVideo}
            storage={props.videoStorage} transport={props.videoTransport} fetchImpl={props.fetchImpl}
            songPreflight={props.videoSongPreflight}
            songReader={props.videoSongReader}
            {...(props.videoSongPicker === undefined ? {} : { songPicker: props.videoSongPicker })}
            alignTake={props.videoAlignTake}
            openPreview={props.videoOpenPreview}
            startCapture={props.videoStartCapture}
            onExit={() => { close(false); }} onPublished={props.onPublished}
            onRetainedPersona={(personaId, retainedCommunityId) => {
              if (personaId !== null) {
                setVideoPersonaId(personaId);
                // A contextual composer keeps its page community; the
                // runtime then reports the retained video's mismatch.
                if (retainedCommunityId && !props.communityContext) setCommunityId(retainedCommunityId);
              }
            }}
          />
        )}
      </Show>
      </div>
    </Show>
  );
}
