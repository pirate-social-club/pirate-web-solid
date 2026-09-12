/** @jsxImportSource @solidjs/web */
import type { CreatePostInput } from "@pirate/api-client";
import type { JSX } from "@solidjs/web";
import { createEffect, createSignal, getOwner, onCleanup, Show, untrack } from "solid-js";

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
import type { SongSubmissionView } from "../media-submission/projection";
import type { MediaSubmissionTransport } from "../media-submission/transport";
import { royaltySplitIssue } from "./earnings-split";
import {
  prepareSongComposer,
  projectSnapshotIntoSongComposer,
  submitComposerLyrics,
  submitSongComposer,
} from "./media-composer-bridge";
import { PostComposer } from "./post-composer";
import { VideoComposerRuntime } from "../video-submission/video-composer-runtime";
import { PostComposerSubmission } from "./post-composer-submission";
import { initialPostComposerState, type PostComposerState } from "./post-composer-state";
import type { TextContentSubmissionRequestEnvelopeV1 } from "./text-submission-contract";
import {
  createTextSubmissionCoordinator,
  TextSubmissionServerRejectionError,
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
  readonly transport?: TextSubmissionTransport;
  readonly mediaTransport?: MediaSubmissionTransport;
  readonly videoStorage?: import("../video-submission/coordinator").VideoStorage;
  readonly videoTransport?: import("../video-submission/transport").VideoTransport;
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
  }, { ownedWrite: true });
  const [songPersonaId, setSongPersonaId] = createSignal<string | undefined>(
    initialPersonaId,
    { ownedWrite: true },
  );
  const [textPersonaId, setTextPersonaId] = createSignal<string | undefined>(initialPersonaId, { ownedWrite: true });
  const [videoPersonaId, setVideoPersonaId] = createSignal<string | undefined>(initialPersonaId, { ownedWrite: true });
  const selectedPersonaId = () => mode() === "video" ? videoPersonaId() : mode() === "song" ? songPersonaId() : textPersonaId();
  const recipientProfiles = () => personas().map(persona => ({
    personaId: persona.personaId,
    displayName: persona.displayName ?? persona.primaryPublicHandle ?? "Profile",
    handle: persona.primaryPublicHandle,
    avatarSrc: persona.avatarRef,
  }));
  const [sourceAssetId, setSourceAssetId] = createSignal("");
  const [error, setError] = createSignal("");
  const [textState, setTextState] = createSignal<PostComposerState>(initialPostComposerState);
  const [mediaView, setMediaView] = createSignal<SongSubmissionView>({ status: "editing" });
  const [mediaSnapshot, setMediaSnapshot] = createSignal<MediaSubmissionSnapshot | null>(null);
  const [mediaBusy, setMediaBusy] = createSignal(false);
  const [lyricsBusy, setLyricsBusy] = createSignal(false);
  const mediaEnabled = props.principalId !== undefined && personas().length > 0;
  let mediaOperationInFlight = false;
  let finishingPublishedSong = false;

  const textCoordinator = createTextSubmissionCoordinator({
    transport: props.transport,
    origin: props.origin,
    fetchImpl: props.fetchImpl,
    onStateChange: setTextState,
  });
  const mediaCoordinator = !mediaEnabled ? undefined : createMediaSubmissionCoordinator({
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

  // The composer inherits the community's active profile whenever it opens on
  // a fresh operation. An unresolved submission in this dialog session keeps
  // the author it was already sent under; a request is never re-keyed to a
  // different profile after dispatch.
  createEffect(
    () => [props.open, props.personaId, props.personas, textState().status] as const,
    ([open]) => {
      if (!open) return;
      const nextPersonaId = initialOperationPersonaId(personas(), props.personaId);
      const textUnresolved = textState().status === "submitting" || textState().status === "reconciling";
      if (!textUnresolved) setTextPersonaId(nextPersonaId);
      if (mediaCoordinator?.currentRecord == null) selectSongPersona(nextPersonaId);
      setVideoPersonaId(nextPersonaId);
    },
  );

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
    observationCount = 0;
    setObservationPaused(false);
    setTitle("");
    setSongAgeGatePolicy("none");
    setError("");
  }

  function discardTerminalSong(): void {
    mediaCoordinator?.discardTerminal();
    resetSongDraft();
  }

  function close(open: boolean): void {
    if (!open) {
      const state = textState();
      if (state.status === "submitting" || state.status === "reconciling") {
        setError("Checking whether your post was accepted. Resolve it before closing.");
        return;
      }
      const view = mediaView();
      if (mediaBusy() || view.status === "uploading" || view.status === "processing" || view.status === "manual_review") {
        setError("This song is still being submitted. Finish it before closing.");
        return;
      }
    }
    props.onOpenChange(open);
  }

  function finishPublished(): void {
    close(false);
    props.onPublished?.();
  }

  function finishSongPublished(): void {
    if (finishingPublishedSong || mediaCoordinator?.currentRecord == null) return;
    finishingPublishedSong = true;
    try {
      discardTerminalSong();
      props.onOpenChange(false);
      props.onPublished?.();
    } finally {
      finishingPublishedSong = false;
    }
  }

  async function submitText(): Promise<void> {
    const personaId = selectedActivePersonaId();
    if (personaId === undefined) {
      setError("Choose a profile before publishing.");
      return;
    }
    const community = communityId().trim();
    const content = body().trim();
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
        setError("The request result is uncertain; checking again is safe.");
      } else if (submissionError instanceof TextSubmissionServerRejectionError) {
        setError("This post couldn't be sent. Check the details and try again.");
      } else if (submissionError instanceof Error) {
        setError(submissionError.message);
      }
    }
  }

  async function retryText(): Promise<void> {
    setError("");
    try {
      if (textState().status === "reconciling") {
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
        authorDeclaredRating: ageGatePolicy() === "18_plus" ? "adult_18" : "general",
      });
      applySnapshot(snapshot);
      if (!prepareOnly && snapshot.status === "published") finishSongPublished();
      return snapshot.audio_revision >= 1;
    } catch (submissionError) {
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
    if (!mediaCoordinator || mediaBusy() || lyricsBusy()) return;
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
    if (disposed || !props.open || mode() !== "song" || mediaBusy() || lyricsBusy()
      || observationPaused()) return;
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
  const songSubmitDisabled = () => mediaBusy()
    || lyricsBusy()
    || !canContinueSongSubmit()
    || selectedActivePersonaId() === undefined
    || communityId().trim() === ""
    || royaltySplitIssue(royaltySplit(), selectedActivePersonaId()) !== "";
  const submitDisabled = () => mode() === "text"
    ? selectedActivePersonaId() === undefined || textState().status !== "editing"
      || communityId().trim() === ""
      || body().trim() === ""
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

  // Where an in-flight song is: before the upload finishes it is Song, and
  // once audio is accepted and terms are issued only Review remains.
  const initialSongStep = (): 1 | 2 | 3 => {
    const snapshot = mediaSnapshot();
    if (snapshot === null || snapshot.audio_revision < 1) return 1;
    if (songTermsIssued()) return 3;
    return 2;
  };

  const mediaStatusPanel = () => (
    <Show when={mode() === "song" && mediaView().status !== "editing"}>
      <div
        aria-live="polite"
        class="grid gap-3 rounded-2xl border border-border-soft bg-card p-5 text-base"
        data-media-composer-state={mediaView().status}
        role={mediaView().status === "blocked" || mediaView().status === "processing_failed" ? "alert" : "status"}
      >
        <p>{mediaSnapshot()?.audio_revision && !songTermsIssued() && mediaView().status === "processing"
          ? "Audio uploaded."
          : mediaStateMessage(mediaView())}</p>
        <Show when={observationPaused()}><FormNote>Automatic checks paused. Check status to try again.</FormNote></Show>
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
          <Button disabled={mediaBusy()} type="button" variant="outline" onClick={() => discardTerminalSong()}>Discard and start over</Button>
        </Show>
      </div>
    </Show>
  );

  const textOutcomePanel = () => (
    <Show when={mode() === "text" && textState().status !== "editing"}>
      <PostComposerSubmission
        onRetry={() => void retryText()}
        state={textState()}
      />
    </Show>
  );

  return (
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
            <Show when={personas().length === 0}>
              <FormNote tone="warning">Choose a profile for this community before posting.</FormNote>
            </Show>
            <Show
              when={mode() !== "video"}
              fallback={
                <Show when={props.principalId}>{account => <VideoComposerRuntime
                  principalId={account()} communityId={communityId().trim()} personaId={selectedActivePersonaId()}
                  storage={props.videoStorage} transport={props.videoTransport} fetchImpl={props.fetchImpl}
                  onExit={() => setMode("text")} onPublished={props.onPublished}
                  onRetainedPersona={(personaId, retainedCommunityId) => {
                    if (personaId !== null) {
                      setVideoPersonaId(personaId);
                      // A contextual composer keeps its page community; the
                      // runtime then reports the retained video's mismatch.
                      if (retainedCommunityId && !props.communityContext) setCommunityId(retainedCommunityId);
                    }
                  }}
                />}</Show>
              }
            >
              <PostComposer
                attachmentBarPlacement="inline"
                audienceEditingDisabled={mode() === "song"
                  ? mediaSnapshot() !== null || mediaBusy()
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
                recipientProfiles={recipientProfiles()}
                songFlowRuntime={mode() === "song" ? {
                  personaId: selectedActivePersonaId(),
                  prepare: () => submitSong(true),
                  prepared: (mediaSnapshot()?.audio_revision ?? 0) >= 1,
                  retained: mediaSnapshot() !== null,
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
                  get loading() { return mode() === "song" ? mediaBusy() : textState().status === "submitting"; },
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
  );
}
