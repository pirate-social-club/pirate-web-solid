/** @jsxImportSource @solidjs/web */
import type { JSX } from "@solidjs/web";
import { createSignal, For, Show } from "solid-js";

import type { ActivePersonaPublicProjection } from "../../../api/session";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FormNote,
  TextField,
  TextFieldDescription,
  TextFieldInput,
  TextFieldLabel,
  Type,
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
  projectSnapshotIntoSongComposer,
  submitComposerLyrics,
  submitSongComposer,
} from "./media-composer-bridge";
import type { PendingSubmissionStorage } from "./pending-submission";
import { PostComposer } from "./post-composer";
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
  ComposerTab,
  SongComposerState,
  SongMode,
} from "./types";

export interface CreatePostDraft {
  readonly communityId: string;
  readonly title: string;
  readonly body: string;
  readonly idempotencyKey: string;
}

export interface PostCommunityContext {
  readonly id: string;
  readonly name: string;
}

/** Keep request construction pure so the contract boundary is easy to test. */
export function buildCreatePostRequest(draft: CreatePostDraft): TextContentSubmissionRequestEnvelopeV1 {
  return {
    path: { communityId: draft.communityId.trim() },
    body: {
      idempotency_key: draft.idempotencyKey,
      post_type: "text",
      authorship_mode: "human_direct",
      identity_mode: "public",
      visibility: "public",
      title: draft.title.trim() === "" ? null : draft.title.trim(),
      body: draft.body.trim(),
    },
  };
}

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `solid-post-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const PRODUCTION_SONG_DRAFT_ID = "production-song-draft-v1";

export function initialOperationPersonaId(
  personas: readonly ActivePersonaPublicProjection[],
): string | undefined {
  return personas.length === 1 ? personas[0]?.personaId : undefined;
}

function personaLabel(persona: ActivePersonaPublicProjection): string {
  return persona.displayName?.trim()
    || (persona.primaryPublicHandle ? `@${persona.primaryPublicHandle}` : persona.personaId);
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
  readonly principalId?: string;
  readonly personas?: readonly ActivePersonaPublicProjection[];
  readonly storage?: PendingSubmissionStorage;
  readonly transport?: TextSubmissionTransport;
  readonly mediaStorage?: MediaSubmissionStorage;
  readonly mediaTransport?: MediaSubmissionTransport;
  readonly createMediaId?: () => string;
  readonly origin?: string | URL;
  readonly fetchImpl?: typeof fetch;
}

export function CreatePostDialog(props: CreatePostDialogProps): JSX.Element {
  const personas = () => props.personas ?? [];
  const initialPersonaId = initialOperationPersonaId(personas());
  const contextualCommunityId = () => props.communityContext?.id.trim() ?? "";
  const [communityId, setCommunityId] = createSignal(contextualCommunityId());
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [mode, setMode] = createSignal<ComposerTab>("text");
  const [songMode, setSongMode] = createSignal<SongMode>("original");
  const [song, setSong] = createSignal<SongComposerState>({
    title: "",
    primaryAudioUpload: null,
    lyricsEditorState: "hidden",
  });
  const [lyrics, setLyrics] = createSignal("");
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
  const [selectedPersonaId, setSelectedPersonaId] = createSignal<string | undefined>(
    initialPersonaId,
  );
  const [error, setError] = createSignal("");
  const [textState, setTextState] = createSignal<PostComposerState>(initialPostComposerState);
  const [mediaView, setMediaView] = createSignal<SongSubmissionView>({ status: "editing" });
  const [mediaSnapshot, setMediaSnapshot] = createSignal<MediaSubmissionSnapshot | null>(null);
  const [mediaBusy, setMediaBusy] = createSignal(false);
  const [lyricsBusy, setLyricsBusy] = createSignal(false);
  const mediaEnabled = props.principalId !== undefined && personas().length > 0;
  const [mediaRestoring, setMediaRestoring] = createSignal(mediaEnabled);

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
    const wasPublished = mediaSnapshot()?.status === "published";
    setMediaSnapshot(snapshot);
    const projection = projectSnapshotIntoSongComposer(snapshot);
    setSong(current => ({ ...current, ...projection.song }));
    if (projection.lyricsValue !== undefined) setLyrics(projection.lyricsValue);
    if (snapshot.status === "published" && !wasPublished) props.onPublished?.();
  }

  void textCoordinator.restore().catch(() => {
    setTextState({ status: "transport_failure", reason: "durable_storage_failed" });
  });

  if (mediaCoordinator !== undefined) {
    void mediaCoordinator.restore(PRODUCTION_SONG_DRAFT_ID)
      .then(record => {
        if (record === null) return;
        setMode("song");
        setCommunityId(record.community_id);
        setSongMode(record.song_draft.song_type);
        setTitle(record.song_draft.title);
        setSong(current => ({
          ...current,
          title: record.song_draft.title,
          primaryAudioUpload: restoredAudio(record),
          primaryAudioLabel: record.audio.name,
        }));
        if (personas().some(persona => persona.personaId === record.persona_id)) {
          selectOperationPersona(record.persona_id);
        }
        if (record.snapshot !== null) applySnapshot(record.snapshot);
      })
      .catch(restorationError => {
        setError(restorationError instanceof Error
          ? restorationError.message
          : "The retained song submission could not be restored safely.");
      })
      .finally(() => setMediaRestoring(false));
  }

  function selectOperationPersona(nextPersonaId: string | undefined): void {
    const previousPersonaId = selectedPersonaId();
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
    setSelectedPersonaId(nextPersonaId);
  }

  function resetSongDraft(): void {
    setMode("text");
    setSongMode("original");
    setSong({ title: "", primaryAudioUpload: null, lyricsEditorState: "hidden" });
    setLyrics("");
    setLicense({ presetId: "non-commercial" });
    const nextPersonaId = initialOperationPersonaId(personas());
    setRoyaltySplit({
      allocations: nextPersonaId === undefined ? [] : [{
        id: "creator",
        recipientKind: "creator",
        recipientId: nextPersonaId,
        shareBps: 10_000,
        sharePct: 100,
      }],
    });
    setSelectedPersonaId(nextPersonaId);
    setMediaSnapshot(null);
    setMediaView({ status: "editing" });
    resetCommunityId();
    setTitle("");
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
      }
      if (mediaCoordinator !== undefined && terminalMediaView(mediaView())) {
        void discardTerminalSong().catch(discardError => {
          setError(discardError instanceof Error ? discardError.message : "The completed song draft could not be cleared.");
        });
      }
    }
    props.onOpenChange(open);
  }

  function startNewTextDraft(): void {
    textCoordinator.startNewDraft();
    resetCommunityId();
    setTitle("");
    setBody("");
    setError("");
  }

  async function discardAndEditText(): Promise<void> {
    setError("");
    try {
      const draft = await textCoordinator.discardRejectedRequest();
      setCommunityId(draft.communityId);
      setTitle(draft.title);
      setBody(draft.body);
    } catch (discardError) {
      setError(discardError instanceof Error ? discardError.message : "The saved request could not be discarded safely.");
    }
  }

  async function submitText(): Promise<void> {
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
        communityId: community,
        title: title(),
        body: content,
        idempotencyKey: createIdempotencyKey(),
      }));
      if (snapshot.status === "published") props.onPublished?.();
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
        const snapshot = await textCoordinator.reconcile();
        if (snapshot.status === "published") props.onPublished?.();
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

  async function submitSong(): Promise<void> {
    const personaId = selectedActivePersonaId();
    const community = communityId().trim();
    if (mediaCoordinator === undefined || props.principalId === undefined) {
      setError("An authenticated account is required to submit a song.");
      return;
    }
    if (personaId === undefined) {
      setError(personas().length === 0
        ? "An active public persona is required to submit a song."
        : "Choose the public persona that will submit this song.");
      return;
    }
    if (community === "") {
      setError("Choose a community before publishing.");
      return;
    }
    if (communityContextConflict()) {
      setError("A retained submission belongs to another community. Resolve it from the global Create post action before posting here.");
      return;
    }
    const retained = mediaCoordinator.currentRecord;
    if (retained !== null && retained.persona_id !== personaId) {
      setError("The retained song belongs to another operation persona and must be resolved first.");
      return;
    }
    setError("");
    setMediaBusy(true);
    try {
      const snapshot = await submitSongComposer({
        coordinator: mediaCoordinator,
        draftId: PRODUCTION_SONG_DRAFT_ID,
        principalId: props.principalId,
        communityId: community,
        personaId,
        song: song(),
        songMode: songMode(),
        license: license(),
        royaltySplit: royaltySplit(),
      });
      applySnapshot(snapshot);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "The song could not be submitted safely.");
    } finally {
      setMediaBusy(false);
    }
  }

  async function refreshSong(): Promise<void> {
    if (mediaCoordinator?.currentRecord?.submission_id == null) return;
    setError("");
    setMediaBusy(true);
    try {
      const snapshot = await mediaCoordinator.refresh();
      if (snapshot !== null) applySnapshot(snapshot);
    } catch (refreshError) {
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

  function submit(): void {
    if (mode() === "text") {
      void submitText();
    } else if (mode() === "song") {
      void submitSong();
    } else {
      setError("This post type does not have a production submission contract yet.");
    }
  }

  const selectedPersona = () => personas().find(persona => persona.personaId === selectedPersonaId());
  const canContinueSongSubmit = () => {
    const view = mediaView();
    return view.status === "editing"
      || view.status === "reconciling"
      || (view.status === "processing" && view.phase === "awaiting_upload");
  };
  const songSubmitDisabled = () => mediaRestoring()
    || mediaBusy()
    || !canContinueSongSubmit()
    || selectedActivePersonaId() === undefined
    || communityId().trim() === ""
    || communityContextConflict();
  const submitDisabled = () => mode() === "text"
    ? textState().status !== "editing"
      || communityId().trim() === ""
      || body().trim() === ""
      || communityContextConflict()
    : mode() === "song" ? songSubmitDisabled() : true;
  const lyricsCanSave = () => {
    const snapshot = mediaSnapshot();
    if (snapshot === null || lyrics().length === 0 || lyricsBusy()) return false;
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

  return (
    <Dialog open={props.open} onOpenChange={close}>
      <DialogContent class="max-h-[92dvh] overflow-y-auto sm:w-[min(100%-2rem,48rem)]">
        <DialogHeader>
          <DialogTitle>Create a post</DialogTitle>
          <DialogDescription>Start a conversation or publish a song in a community you belong to.</DialogDescription>
        </DialogHeader>
        <Show when={props.open}>
          <div class="grid gap-4">
            <Show
              when={props.communityContext}
              fallback={(
                <TextField name="community-id" value={communityId()} onChange={setCommunityId}>
                  <TextFieldLabel>Community ID</TextFieldLabel>
                  <TextFieldInput autocomplete="off" placeholder="The community identifier" />
                  <TextFieldDescription>Posts are community-scoped. A friendly community picker will replace this field.</TextFieldDescription>
                </TextField>
              )}
            >
              {context => (
                <Show
                  when={!communityContextConflict()}
                  fallback={(
                    <FormNote tone="warning">
                      A retained submission belongs to another community. Resolve it from the global Create post action before posting here.
                    </FormNote>
                  )}
                >
                  <div class="rounded-2xl border border-border-soft bg-card p-4" data-community-context={context().id}>
                    <Type as="p" variant="label">Posting in {context().name}</Type>
                    <Type as="p" class="mt-1" variant="caption">This community is selected from the page.</Type>
                  </div>
                </Show>
              )}
            </Show>

            <Show when={mode() === "song" && personas().length > 1}>
              <label class="grid gap-2 text-sm font-medium">
                <span>Post as</span>
                <select
                  aria-label="Operation persona"
                  class="h-11 w-full rounded-full border border-input bg-background px-4 text-base"
                  disabled={mediaCoordinator?.currentRecord !== null && mediaCoordinator?.currentRecord !== undefined}
                  name="operation-persona"
                  onChange={event => selectOperationPersona(event.currentTarget.value || undefined)}
                  value={selectedPersonaId() ?? ""}
                >
                  <option value="">Choose a public persona</option>
                  <For each={personas()}>{persona => (
                    <option value={persona.personaId}>{personaLabel(persona)}</option>
                  )}</For>
                </select>
                <span class="text-sm font-normal text-muted-foreground">Choose which active public persona authors this song.</span>
              </label>
            </Show>
            <Show when={mode() === "song" && personas().length === 1 && selectedPersona()}>
              {(persona) => <Type as="p" variant="caption">Posting as {personaLabel(persona())}</Type>}
            </Show>
            <Show when={personas().length === 0}>
              <FormNote tone="warning">Create or reactivate a public persona before submitting a song.</FormNote>
            </Show>

            <PostComposer
              availableTabs={["text", "song"]}
              canCreateSongPost={personas().length > 0}
              currentPersonaId={selectedPersonaId()}
              identity={{
                visible: mode() === "song",
                publicHandle: selectedPersona()?.primaryPublicHandle ?? undefined,
                publicAvatarSrc: selectedPersona()?.avatarRef,
              }}
              license={license()}
              lyricsValue={lyrics()}
              mode={mode()}
              onClose={() => close(false)}
              onLicenseChange={setLicense}
              onLyricsValueChange={setLyrics}
              onModeChange={setMode}
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
              presentation="embedded"
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
              titleValue={title()}
              validateDraftBeforeSubmit={mode() !== "text"}
            />
            <div class="flex justify-end">
              <Button type="button" variant="outline" onClick={() => close(false)}>Cancel</Button>
            </div>

            <Show when={mode() === "text" && textState().status !== "editing"}>
              <PostComposerSubmission
                onDiscardAndEdit={() => void discardAndEditText()}
                onNewDraft={startNewTextDraft}
                onRetry={() => void retryText()}
                onResolveOldest={() => { textCoordinator.resolveOldestPending(); }}
                state={textState()}
              />
            </Show>

            <Show when={mode() === "song" && (mediaView().status !== "editing" || mediaRestoring())}>
              <div
                aria-live="polite"
                class="grid gap-3 rounded-2xl border border-border-soft bg-card p-5 text-base"
                data-media-composer-state={mediaRestoring() ? "restoring" : mediaView().status}
                role={mediaView().status === "blocked" || mediaView().status === "processing_failed" ? "alert" : "status"}
              >
                <p>{mediaRestoring() ? "Restoring the retained song submission…" : mediaStateMessage(mediaView())}</p>
                <Show when={mediaCoordinator?.currentRecord?.issue}>
                  {(issue) => <FormNote tone="warning">The retained command has a {issue().kind.replaceAll("_", " ")} and will not be re-keyed automatically.</FormNote>}
                </Show>
                <Show when={mediaCoordinator?.currentRecord?.submission_id != null && !terminalMediaView(mediaView())}>
                  <Button disabled={mediaBusy()} type="button" variant="outline" onClick={() => void refreshSong()}>Check status</Button>
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
                <Show when={terminalMediaView(mediaView())}>
                  <Button disabled={mediaBusy()} type="button" variant="outline" onClick={() => void discardTerminalSong()}>Start a new post</Button>
                </Show>
              </div>
            </Show>
          </div>
        </Show>
        <Type as="p" variant="caption" class="text-muted-foreground">Submissions use the same-origin session and durable generated-client contracts.</Type>
      </DialogContent>
    </Dialog>
  );
}
