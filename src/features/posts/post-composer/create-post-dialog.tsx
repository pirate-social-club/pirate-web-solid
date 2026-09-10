/** @jsxImportSource @solidjs/web */
import type { CreatePostInput } from "@pirate/api-client";
import type { JSX } from "@solidjs/web";
import { createSignal, getOwner, onCleanup, Show, untrack } from "solid-js";

import type { ActivePersonaPublicProjection } from "../../../api/session";
import {
  Button,
  FormNote,
  TextField,
  TextFieldDescription,
  TextFieldInput,
  TextFieldLabel,
} from "../../../design-system";
import type { MediaSubmissionSnapshot } from "../media-submission/contracts";
import {
  createMediaSubmissionCoordinator,
  type MediaSubmissionCoordinator,
} from "../media-submission/coordinator";
import type { MediaSubmissionStorage } from "../media-submission/pending";
import type { SongSubmissionView } from "../media-submission/projection";
import type { MediaSubmissionTransport } from "../media-submission/transport";
import {
  prepareSongComposer,
  restoreSongComposerTerms,
  projectSnapshotIntoSongComposer,
  submitComposerLyrics,
  submitSongComposer,
} from "./media-composer-bridge";
import { decodePendingSubmissionDraft, type PendingSubmissionStorage } from "./pending-submission";
import { PostComposer } from "./post-composer";
import { VideoComposerRuntime } from "../video-submission/video-composer-runtime";
import { PostComposerSubmission } from "./post-composer-submission";
import { initialPostComposerState, type PostComposerState } from "./post-composer-state";
import type { TextContentSubmissionRequestEnvelopeV1 } from "./text-submission-contract";
import {
  createTextSubmissionCoordinator,
  type TextSubmissionTransport,
} from "./text-submission-transport";
import type {
  AssetLicenseState,
  AssetRoyaltySplitState,
  AuthorAgeGatePolicy,
  ComposerTab,
  SongComposerState,
  SongMode,
} from "./types";

export interface CreatePostDraft {
  readonly communityId: string;
  readonly personaId: string;
  readonly title: string;
  readonly body: string;
  readonly idempotencyKey: string;
  readonly ageGatePolicy: AuthorAgeGatePolicy;
}

export interface PostCommunityContext {
  readonly id: string;
  readonly name: string;
}

/** Keep request construction pure so the contract boundary is easy to test. */
export function buildCreatePostRequest(draft: CreatePostDraft): TextContentSubmissionRequestEnvelopeV1 {
  const path = { communityId: draft.communityId.trim() } satisfies CreatePostInput["path"];
  const body = {
    idempotency_key: draft.idempotencyKey,
    persona_id: draft.personaId.trim(),
    post_type: "text",
    authorship_mode: "human_direct",
    identity_mode: "public",
    visibility: "public",
    author_declared_rating: draft.ageGatePolicy === "18_plus" ? "adult_18" : "general",
    title: draft.title.trim() === "" ? null : draft.title.trim(),
    body: draft.body.trim(),
  } satisfies CreatePostInput["body"];
  return { path, body };
}

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `solid-post-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const PRODUCTION_SONG_DRAFT_ID = "production-song-draft-v1";

export function initialOperationPersonaId(
  personas: readonly ActivePersonaPublicProjection[],
  preferredPersonaId?: string,
): string | undefined {
  return personas.find(persona => persona.personaId === preferredPersonaId)?.personaId
    ?? personas[0]?.personaId;
}

function restoredAudio(record: NonNullable<MediaSubmissionCoordinator["currentRecord"]>): File {
  return new File([record.audio.blob], record.audio.name, {
    type: record.audio.type,
    lastModified: record.audio.last_modified,
  });
}

function terminalMediaView(view: SongSubmissionView): boolean {
  return view.status === "published" || view.status === "blocked" || view.status === "abandoned";
}

function mediaStateMessage(view: SongSubmissionView): string {
  switch (view.status) {
    case "editing": return "Ready to submit your song.";
    case "reconciling": return "Checking the retained song submission before sending another command…";
    case "uploading": return `Uploading audio (${view.bytesSent} of ${view.bytesTotal} bytes)…`;
    case "processing": return `The song is processing (${view.phase.replaceAll("_", " ")}).`;
    case "action_required": return "A source reference is required before this song can continue.";
    case "manual_review": return "This song is awaiting manual review.";
    case "published": return "Song published.";
    case "blocked": return "This song was blocked by policy.";
    case "processing_failed": return `Song processing failed (${view.reasonCode.replaceAll("_", " ")}).`;
    case "abandoned": return "This song submission was cancelled.";
  }
}

export interface CreatePostDialogProps {
  readonly communityContext?: PostCommunityContext;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPublished?: () => void;
  readonly personaId?: string;
  readonly principalId?: string;
  readonly personas?: readonly ActivePersonaPublicProjection[];
  readonly storage?: PendingSubmissionStorage;
  readonly transport?: TextSubmissionTransport;
  readonly mediaStorage?: MediaSubmissionStorage;
  readonly mediaTransport?: MediaSubmissionTransport;
  readonly videoStorage?: import("../video-submission/coordinator").VideoStorage;
  readonly videoTransport?: import("../video-submission/transport").VideoTransport;
  readonly createMediaId?: () => string;
  readonly origin?: string | URL;
  readonly fetchImpl?: typeof fetch;
}

export function CreatePostDialog(props: CreatePostDialogProps): JSX.Element {
  const personas = () => props.personas ?? [];
  const initialPersonaId = untrack(() => initialOperationPersonaId(personas(), props.personaId));
  const contextualCommunityId = () => props.communityContext?.id.trim() ?? "";
  const [communityId, setCommunityId] = createSignal(contextualCommunityId());
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [textAgeGatePolicy, setTextAgeGatePolicy] = createSignal<AuthorAgeGatePolicy>("none");
  const [songAgeGatePolicy, setSongAgeGatePolicy] = createSignal<AuthorAgeGatePolicy>("none");
  const [mode, setMode] = createSignal<ComposerTab>("text");
  const ageGatePolicy = () => mode() === "song" ? songAgeGatePolicy() : textAgeGatePolicy();
  const setAgeGatePolicy = (next: AuthorAgeGatePolicy) => {
    if (mode() === "song") setSongAgeGatePolicy(next);
    else setTextAgeGatePolicy(next);
  };
  const [songMode, setSongMode] = createSignal<SongMode>("original");
  const [song, setSong] = createSignal<SongComposerState>({
    title: "",
    primaryAudioUpload: null,
    lyricsEditorState: "hidden",
  });
  const [lyrics, setLyrics] = createSignal("");
  let lyricsEdited = false;
  const [license, setLicense] = createSignal<AssetLicenseState>({ presetId: "non-commercial" });
  const [royaltySplit, setRoyaltySplit] = createSignal<AssetRoyaltySplitState>({
    allocations: initialPersonaId === undefined ? [] : [{
      id: "creator",
      recipientKind: "creator",
      recipientId: initialPersonaId,
      shareBps: 10_000,
      sharePct: 100,
    }],
  });
  const [songPersonaId, setSongPersonaId] = createSignal<string | undefined>(
    initialPersonaId,
  );
  const [textPersonaId, setTextPersonaId] = createSignal<string | undefined>(initialPersonaId);
  const [videoPersonaId, setVideoPersonaId] = createSignal<string | undefined>(initialPersonaId);
  const [videoRetained, setVideoRetained] = createSignal(false);
  const selectedPersonaId = () => mode() === "video" ? videoPersonaId() : mode() === "song" ? songPersonaId() : textPersonaId();
  const [sourceAssetId, setSourceAssetId] = createSignal("");
  const [error, setError] = createSignal("");
  const [textState, setTextState] = createSignal<PostComposerState>(initialPostComposerState);
  const [textRestoring, setTextRestoring] = createSignal(true);
  const [mediaView, setMediaView] = createSignal<SongSubmissionView>({ status: "editing" });
  const [mediaSnapshot, setMediaSnapshot] = createSignal<MediaSubmissionSnapshot | null>(null);
  const [mediaBusy, setMediaBusy] = createSignal(false);
  const [lyricsBusy, setLyricsBusy] = createSignal(false);
  const mediaEnabled = props.principalId !== undefined && personas().length > 0;
  const [mediaRestoring, setMediaRestoring] = createSignal(mediaEnabled);
  const [mediaRecordRetained, setMediaRecordRetained] = createSignal(false);
  let mediaOperationInFlight = false;
  let finishingPublishedSong = false;

  const communityContextConflict = () => contextualCommunityId() !== ""
    && communityId().trim() !== ""
    && communityId().trim() !== contextualCommunityId();
  const resetCommunityId = () => setCommunityId(contextualCommunityId());

  const textCoordinator = createTextSubmissionCoordinator({
    principalId: props.principalId,
    storage: props.storage,
    transport: props.transport,
    origin: props.origin,
    fetchImpl: props.fetchImpl,
    onStateChange: setTextState,
  });
  const mediaCoordinator = !mediaEnabled ? undefined : createMediaSubmissionCoordinator({
    principalId: props.principalId,
    storage: props.mediaStorage,
    transport: props.mediaTransport,
    createId: props.createMediaId,
    origin: props.origin,
    fetchImpl: props.fetchImpl,
    onStateChange: setMediaView,
    onSnapshotChange: applySnapshot,
  });

  function applySnapshot(snapshot: MediaSubmissionSnapshot): void {
    setMediaSnapshot(snapshot);
    const projection = projectSnapshotIntoSongComposer(snapshot);
    setSong(current => ({ ...current, ...projection.song }));
    if (projection.lyricsValue !== undefined && !lyricsEdited) setLyrics(projection.lyricsValue);
    if (snapshot.status === "published" && !mediaOperationInFlight) void finishSongPublished();
  }

  void textCoordinator.restore()
    .then(() => {
      const envelope = textCoordinator.pendingEnvelope;
      if (envelope === null) return;
      const draft = decodePendingSubmissionDraft(envelope);
      setTextPersonaId(draft.personaId);
      setCommunityId(draft.communityId);
      setTextAgeGatePolicy(draft.authorDeclaredRating === "adult_18" ? "18_plus" : "none");
    })
    .catch(() => {
      setTextState({ status: "transport_failure", reason: "durable_storage_failed" });
    })
    .finally(() => setTextRestoring(false));

  if (mediaCoordinator !== undefined) {
    void mediaCoordinator.restore(PRODUCTION_SONG_DRAFT_ID)
      .then(async record => {
        if (record === null) return;
        setMediaRecordRetained(true);
        setMode("song");
        setCommunityId(record.community_id);
        setSongMode(record.song_draft.song_type);
        setSongAgeGatePolicy(record.song_draft.author_declared_rating === "adult_18" ? "18_plus" : "none");
        setTitle(record.song_draft.title);
        setSong(current => ({
          ...current,
          title: record.song_draft.title,
          primaryAudioUpload: restoredAudio(record),
          primaryAudioLabel: record.audio.name,
        }));
        if (personas().some(persona => persona.personaId === record.persona_id)) {
          selectSongPersona(record.persona_id);
        }
        const terms = await restoreSongComposerTerms(record);
        if (terms) { setLicense(terms.license); setRoyaltySplit(terms.royaltySplit); }
        if (record.snapshot !== null) applySnapshot(record.snapshot);
      })
      .catch(restorationError => {
        setError(restorationError instanceof Error
          ? restorationError.message
          : "The retained song submission could not be restored safely.");
      })
      .finally(() => setMediaRestoring(false));
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
    setMode("text");
    setSongMode("original");
    setSong({ title: "", primaryAudioUpload: null, lyricsEditorState: "hidden" });
    setLyrics("");
    lyricsEdited = false;
    setLicense({ presetId: "non-commercial" });
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
    setMediaRecordRetained(false);
    observationCount = 0;
    setObservationPaused(false);
    resetCommunityId();
    setTitle("");
    setSongAgeGatePolicy("none");
    setError("");
  }

  async function discardTerminalSong(): Promise<void> {
    if (mediaCoordinator?.currentRecord !== null && mediaCoordinator?.currentRecord !== undefined) {
      await mediaCoordinator.discardTerminal();
    }
    resetSongDraft();
  }

  function close(open: boolean): void {
    if (!open) {
      setError("");
      const state = textState();
      if (state.status === "published" || state.status === "manual_review" || state.status === "blocked" || state.status === "abandoned") {
        textCoordinator.startNewDraft();
        resetCommunityId();
        setTitle("");
        setBody("");
        setTextAgeGatePolicy("none");
      }
      if (mediaCoordinator !== undefined && terminalMediaView(mediaView())) {
        void discardTerminalSong().catch(discardError => {
          setError(discardError instanceof Error ? discardError.message : "The completed song draft could not be cleared.");
        });
      }
    }
    props.onOpenChange(open);
  }

  function finishPublished(): void {
    close(false);
    props.onPublished?.();
  }

  async function finishSongPublished(): Promise<void> {
    if (finishingPublishedSong || mediaCoordinator?.currentRecord == null) return;
    finishingPublishedSong = true;
    try {
      await discardTerminalSong();
      props.onOpenChange(false);
      props.onPublished?.();
    } finally {
      finishingPublishedSong = false;
    }
  }

  function startNewTextDraft(): void {
    textCoordinator.startNewDraft();
    resetCommunityId();
    setTitle("");
    setBody("");
    setTextAgeGatePolicy("none");
    setError("");
  }

  async function discardAndEditText(): Promise<void> {
    setError("");
    try {
      const draft = await textCoordinator.discardRejectedRequest();
      setTextPersonaId(draft.personaId);
      setCommunityId(draft.communityId);
      setTitle(draft.title);
      setBody(draft.body);
      setTextAgeGatePolicy(draft.authorDeclaredRating === "adult_18" ? "18_plus" : "none");
    } catch (discardError) {
      setError(discardError instanceof Error ? discardError.message : "The saved request could not be discarded safely.");
    }
  }

  async function submitText(): Promise<void> {
    const personaId = selectedActivePersonaId();
    if (personaId === undefined || textRestoring()) {
      setError("Choose a public persona before publishing.");
      return;
    }
    const community = communityId().trim();
    const content = body().trim();
    if (communityContextConflict()) {
      setError("A retained submission belongs to another community. Resolve it from the global Create post action before posting here.");
      return;
    }
    if (community === "" || content === "") {
      setError("Choose a community and write something before publishing.");
      return;
    }
    setError("");
    try {
      const snapshot = await textCoordinator.submit(buildCreatePostRequest({
        personaId,
        communityId: community,
        title: title(),
        body: content,
        idempotencyKey: createIdempotencyKey(),
        ageGatePolicy: ageGatePolicy(),
      }));
      if (snapshot.status === "published") finishPublished();
    } catch (submissionError) {
      if (textCoordinator.state.status === "transport_failure") {
        setError("Your post could not be prepared for safe retry.");
      } else if (textCoordinator.state.status === "reconciling") {
        setError("The request result is uncertain; the saved request can be checked again safely.");
      } else if (submissionError instanceof Error) {
        setError(submissionError.message);
      }
    }
  }

  async function retryText(): Promise<void> {
    setError("");
    try {
      if (textState().status === "reconciling") {
        if (communityContextConflict()) {
          setError("A retained submission belongs to another community. Resolve it from the global Create post action before posting here.");
          return;
        }
        const snapshot = await textCoordinator.reconcile();
        if (snapshot.status === "published") finishPublished();
      } else {
        await submitText();
      }
    } catch {
      if (textCoordinator.state.status === "reconciling") setError("The request result is still uncertain. Try checking again.");
    }
  }

  function selectedActivePersonaId(): string | undefined {
    const selected = selectedPersonaId();
    return selected !== undefined && personas().some(persona => persona.personaId === selected)
      ? selected
      : undefined;
  }

  async function submitSong(prepareOnly = false): Promise<boolean> {
    if (mediaBusy() || lyricsBusy() || mediaRestoring()) return false;
    const personaId = selectedActivePersonaId();
    const community = communityId().trim();
    if (mediaCoordinator === undefined || props.principalId === undefined) {
      setError("An authenticated account is required to submit a song.");
      return false;
    }
    if (personaId === undefined) {
      setError(personas().length === 0
        ? "An active public persona is required to submit a song."
        : "Choose the public persona that will submit this song.");
      return false;
    }
    if (community === "") {
      setError("Choose a community before publishing.");
      return false;
    }
    if (communityContextConflict()) {
      setError("A retained submission belongs to another community. Resolve it from the global Create post action before posting here.");
      return false;
    }
    const retained = mediaCoordinator.currentRecord;
    if (retained !== null && retained.persona_id !== personaId) {
      setError("The retained song belongs to another operation persona and must be resolved first.");
      return false;
    }
    setError("");
    setMediaBusy(true);
    setMediaRecordRetained(true);
    mediaOperationInFlight = true;
    try {
      const snapshot = await (prepareOnly ? prepareSongComposer : submitSongComposer)({
        coordinator: mediaCoordinator,
        draftId: PRODUCTION_SONG_DRAFT_ID,
        principalId: props.principalId,
        communityId: community,
        personaId,
        song: song(),
        lyrics: lyrics(),
        songMode: songMode(),
        license: license(),
        royaltySplit: royaltySplit(),
        authorDeclaredRating: ageGatePolicy() === "18_plus" ? "adult_18" : "general",
      });
      applySnapshot(snapshot);
      if (!prepareOnly && snapshot.status === "published") await finishSongPublished();
      return snapshot.audio_revision >= 1;
    } catch (submissionError) {
      if (mediaCoordinator.currentRecord === null) setMediaRecordRetained(false);
      setError(submissionError instanceof Error ? submissionError.message : "The song could not be submitted safely.");
      return false;
    } finally {
      mediaOperationInFlight = false;
      setMediaBusy(false);
    }
  }

  async function refreshSong(automatic = false): Promise<void> {
    if (mediaCoordinator?.currentRecord?.submission_id == null || mediaBusy() || lyricsBusy()) return;
    if (!automatic) { observationCount = 0; setObservationPaused(false); }
    setError("");
    setMediaBusy(true);
    try {
      const snapshot = await mediaCoordinator.refresh();
      if (snapshot !== null) applySnapshot(snapshot);
    } catch (refreshError) {
      if (automatic) setObservationPaused(true);
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

  async function bindSongReference(): Promise<void> {
    if (!mediaCoordinator || mediaBusy() || lyricsBusy() || communityContextConflict()) return;
    setError(""); setMediaBusy(true);
    try { applySnapshot(await mediaCoordinator.bindReference(sourceAssetId())); }
    catch (error) { setError(error instanceof Error ? error.message : "The source song could not be bound."); }
    finally { setMediaBusy(false); }
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

  function submit(): void {
    if (mode() === "text") {
      void submitText();
    } else if (mode() === "song") {
      void submitSong();
    } else {
      setError("This post type does not have a production submission contract yet.");
    }
  }

  const songTermsIssued = () => {
    // currentRecord is not reactive. Every coordinator command path must apply
    // its snapshot so this dependency invalidates after retained commands change.
    mediaSnapshot();
    return mediaCoordinator?.currentRecord?.commands.some(command => command.kind === "terms") ?? false;
  };
  let observationCount = 0;
  let disposed = false;
  const [observationPaused, setObservationPaused] = createSignal(false);
  const observation = typeof window !== "undefined" && getOwner() ? setInterval(() => {
    if (disposed || !props.open || mode() !== "song" || mediaRestoring() || mediaBusy() || lyricsBusy()
      || observationPaused() || communityContextConflict()) return;
    const view = mediaView();
    if (view.status !== "processing" && view.status !== "manual_review") return;
    if (mediaCoordinator?.currentRecord?.submission_id == null) return;
    if (++observationCount > 200) { setObservationPaused(true); return; }
    void refreshSong(true);
  }, 3_000) : undefined;
  if (observation !== undefined) onCleanup(() => { disposed = true; clearInterval(observation); });

  const canContinueSongSubmit = () => {
    const view = mediaView();
    return view.status === "editing"
      || view.status === "reconciling"
      || (view.status === "processing" && !songTermsIssued());
  };
  const songSubmitDisabled = () => mediaRestoring()
    || mediaBusy()
    || lyricsBusy()
    || !canContinueSongSubmit()
    || selectedActivePersonaId() === undefined
    || communityId().trim() === ""
    || communityContextConflict();
  const submitDisabled = () => mode() === "text"
    ? textRestoring() || selectedActivePersonaId() === undefined || textState().status !== "editing"
      || communityId().trim() === ""
      || body().trim() === ""
      || communityContextConflict()
    : mode() === "song" ? songSubmitDisabled() : true;
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
  const canRetrySong = () => {
    const view = mediaView();
    return view.status === "processing_failed" && view.retryable;
  };

  // Where a retained song resumes: before the upload finishes it is Song,
  // with audio but unbound lyrics it is Lyrics, once lyrics are accepted it
  // is Rights, and after terms are issued only Review remains.
  const initialSongStep = (): 1 | 2 | 3 | 4 => {
    if (mediaRestoring()) return 1;
    const snapshot = mediaSnapshot();
    if (snapshot === null || snapshot.audio_revision < 1) return 1;
    if (songTermsIssued()) return 4;
    return snapshot.lyrics_state.current.status === "ready" ? 3 : 2;
  };

  const mediaStatusPanel = () => (
    <Show when={mode() === "song" && (mediaView().status !== "editing" || mediaRestoring())}>
      <div
        aria-live="polite"
        class="grid gap-3 rounded-2xl border border-border-soft bg-card p-5 text-base"
        data-media-composer-state={mediaRestoring() ? "restoring" : mediaView().status}
        role={mediaView().status === "blocked" || mediaView().status === "processing_failed" ? "alert" : "status"}
      >
        <p>{mediaRestoring() ? "Restoring the retained song submission…"
          : mediaSnapshot()?.audio_revision && !songTermsIssued() && mediaView().status === "processing"
            ? "Audio uploaded."
            : mediaStateMessage(mediaView())}</p>
        <Show when={observationPaused()}><FormNote>Automatic checks paused. Check status to try again.</FormNote></Show>
        <Show when={mediaCoordinator?.currentRecord?.issue}>
          {(issue) => <FormNote tone="warning">The retained command has a {issue().kind.replaceAll("_", " ")} and will not be re-keyed automatically.</FormNote>}
        </Show>
        <Show when={mediaCoordinator?.currentRecord?.submission_id != null && !terminalMediaView(mediaView())}>
          <Button disabled={mediaBusy()} type="button" variant="outline" onClick={() => void refreshSong()}>Check status</Button>
        </Show>
        <Show when={canCancelSong()}>
          <Button disabled={mediaBusy()} type="button" variant="ghost" onClick={() => void cancelSong()}>Cancel song submission</Button>
        </Show>
        <Show when={mediaView().status === "action_required"}>
          <TextField value={sourceAssetId()} onChange={setSourceAssetId}>
            <TextFieldLabel>Source song asset ID</TextFieldLabel>
            <TextFieldInput />
            <TextFieldDescription>Provide the published source asset requested for this recording.</TextFieldDescription>
          </TextField>
          <Button disabled={mediaBusy() || sourceAssetId().trim() === ""} onClick={() => void bindSongReference()}>Confirm source song</Button>
        </Show>
        <Show when={canRetrySong()}>
          <Button disabled={mediaBusy()} type="button" variant="outline" onClick={() => void retrySong()}>Retry processing</Button>
        </Show>
        <Show when={lyricsCanSave()}>
          <Button disabled={lyricsBusy()} type="button" onClick={() => void saveLyrics()}>Save reviewed lyrics</Button>
        </Show>
        <Show when={terminalMediaView(mediaView()) && mediaView().status !== "published"}>
          <Button disabled={mediaBusy()} type="button" variant="outline" onClick={() => void discardTerminalSong()}>Discard and start over</Button>
        </Show>
      </div>
    </Show>
  );

  const textOutcomePanel = () => (
    <Show when={mode() === "text" && textState().status !== "editing"}>
      <PostComposerSubmission
        onDiscardAndEdit={() => void discardAndEditText()}
        onNewDraft={startNewTextDraft}
        onRetry={() => void retryText()}
        onResolveOldest={() => { textCoordinator.resolveOldestPending(); }}
        state={textState()}
      />
    </Show>
  );

  return (
    <Show when={props.open}>
      <form
        aria-label="Create a post"
        class="fixed inset-0 z-40 overflow-y-auto bg-background px-3 py-4 sm:px-6 sm:py-8"
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
            <Show when={communityContextConflict()}>
              <FormNote tone="warning">
                A retained submission belongs to another community. Resolve it from the global Create post action before posting here.
              </FormNote>
            </Show>
            <Show when={personas().length === 0}>
              <FormNote tone="warning">Create or reactivate a public persona before submitting a post.</FormNote>
            </Show>
            <Show
              when={mode() !== "video"}
              fallback={
                <Show when={props.principalId}>{account => <VideoComposerRuntime
                  principalId={account()} communityId={communityContextConflict() ? contextualCommunityId() : communityId().trim()} personaId={selectedActivePersonaId()}
                  storage={props.videoStorage} transport={props.videoTransport} fetchImpl={props.fetchImpl}
                  onExit={() => setMode("text")} onPublished={props.onPublished}
                  onRetainedPersona={(personaId, retainedCommunityId) => {
                    setVideoRetained(personaId !== null);
                    if (personaId !== null) { setVideoPersonaId(personaId); if (retainedCommunityId) setCommunityId(retainedCommunityId); }
                  }}
                />}</Show>
              }
            >
              <PostComposer
                attachmentBarPlacement="inline"
                audienceEditingDisabled={mode() === "song"
                  ? mediaRestoring() || mediaRecordRetained()
                  : textState().status !== "editing" && textState().status !== "transport_failure"}
                availableCapabilities={["text", "song", "video"]}
                canCreateSongPost={personas().length > 0}
                currentPersonaId={selectedPersonaId()}
                initialSongStep={initialSongStep()}
                license={license()}
                lyricsValue={lyrics()}
                mediaStatus={mediaStatusPanel}
                mode={mode()}
                onClose={() => close(false)}
                onLicenseChange={setLicense}
                onAgeGatePolicyChange={setAgeGatePolicy}
                onLyricsValueChange={value => { lyricsEdited = true; setLyrics(value); }}
                onModeChange={setMode}
                onVideoEntry={() => setMode("video")}
                onRoyaltySplitChange={setRoyaltySplit}
                onSongChange={next => {
                  setSong(next);
                  if (next.title !== undefined) setTitle(next.title);
                }}
                onSongModeChange={setSongMode}
                onTextBodyValueChange={setBody}
                onTitleValueChange={value => {
                  setTitle(value);
                  if (mode() === "song") setSong(current => ({ ...current, title: value }));
                }}
                songFlowRuntime={mode() === "song" ? {
                  personaId: selectedActivePersonaId(),
                  prepare: () => submitSong(true),
                  prepared: (mediaSnapshot()?.audio_revision ?? 0) >= 1,
                  retained: mediaRecordRetained(),
                  locked: mediaBusy() || lyricsBusy() || songTermsIssued() || terminalMediaView(mediaView()),
                } : undefined}
                ageGatePolicy={ageGatePolicy()}
                royaltySplit={royaltySplit()}
                song={song()}
                songMode={songMode()}
                submit={{
                  get disabled() { return submitDisabled(); },
                  get error() { return error() || null; },
                  get label() { return mode() === "song" ? "Publish song" : "Publish post"; },
                  get loading() { return mode() === "song" ? mediaBusy() || mediaRestoring() : textState().status === "submitting"; },
                  onSubmit: submit,
                }}
                textBodyValue={body()}
                textOutcome={textOutcomePanel}
                titleValue={title()}
                validateDraftBeforeSubmit={mode() !== "text"}
              />
            </Show>
        </div>
      </form>
    </Show>
  );
}
