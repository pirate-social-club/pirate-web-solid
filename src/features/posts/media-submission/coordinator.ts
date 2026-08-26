import type {
  PostMediaPostSubmissionsSubmissionIdCancelInput,
  PostMediaPostSubmissionsSubmissionIdFinalizeInput,
  PostMediaPostSubmissionsSubmissionIdRetryInput,
} from "@pirate/api-client";
import { base64UrlToBytes } from "../post-composer/text-submission-contract";
import {
  buildReserveSongAudioInput,
  buildSongLyricsInput,
  buildSongTermsInput,
  buildStartSongInput,
  type MediaSubmissionSnapshot,
  type SongLicensePreset,
  type SongRoyaltyAllocation,
} from "./contracts";
import {
  createDefaultMediaSubmissionStorage,
  createPersistedMediaCommand,
  MEDIA_PENDING_VERSION,
  type MediaSubmissionStorage,
  type PendingMediaSubmissionV1,
  type PersistedMediaCommand,
} from "./pending";
import { projectMediaSubmission, type SongSubmissionView } from "./projection";
import {
  AmbiguousMediaSubmissionError,
  createSameOriginMediaSubmissionTransport,
  MediaSubmissionConflictError,
  type MediaCommandResult,
  type MediaSubmissionTransport,
} from "./transport";

export interface BeginSongSubmissionInput {
  readonly draftId: string;
  readonly principalId: string;
  readonly communityId: string;
  readonly personaId: string;
  readonly audio: File;
  readonly title: string;
  readonly songType: "original" | "remix";
  readonly expectedSha256?: string;
}

export interface BindSongTermsInput {
  readonly licensePreset: SongLicensePreset;
  readonly commercialRevShareBps?: number;
  readonly allocations: readonly SongRoyaltyAllocation[];
}

export interface MediaSubmissionCoordinatorOptions {
  readonly principalId?: string;
  readonly storage?: MediaSubmissionStorage;
  readonly transport?: MediaSubmissionTransport;
  readonly origin?: string | URL;
  readonly fetchImpl?: typeof fetch;
  readonly createId?: () => string;
  readonly now?: () => string;
  readonly onStateChange?: (view: SongSubmissionView) => void;
}

interface RevisionCommandBody {
  readonly expected_creation_revision?: number;
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function snapshotResult(result: MediaCommandResult): result is MediaSubmissionSnapshot {
  return "submission_id" in result;
}

function terminal(snapshot: MediaSubmissionSnapshot): boolean {
  return snapshot.status === "published" || snapshot.status === "blocked" || snapshot.status === "abandoned";
}

export class MediaSubmissionCoordinator {
  readonly storage: MediaSubmissionStorage;
  readonly transport: MediaSubmissionTransport;
  private record: PendingMediaSubmissionV1 | null = null;
  private view: SongSubmissionView = { status: "editing" };
  private readonly createId: () => string;
  private readonly now: () => string;
  private readonly onStateChange?: (view: SongSubmissionView) => void;

  constructor(options: MediaSubmissionCoordinatorOptions = {}) {
    this.storage = options.storage ?? createDefaultMediaSubmissionStorage(options.principalId);
    this.transport = options.transport ?? createSameOriginMediaSubmissionTransport({ origin: options.origin, fetchImpl: options.fetchImpl });
    this.createId = options.createId ?? randomId;
    this.now = options.now ?? (() => new Date().toISOString());
    this.onStateChange = options.onStateChange;
  }

  get currentRecord(): PendingMediaSubmissionV1 | null { return this.record; }
  get state(): SongSubmissionView { return this.view; }

  private setView(view: SongSubmissionView): void {
    this.view = view;
    this.onStateChange?.(view);
  }

  private async save(next: PendingMediaSubmissionV1): Promise<void> {
    this.record = next;
    await this.storage.save(next);
  }

  private requireRecord(): PendingMediaSubmissionV1 {
    if (this.record === null) throw new Error("No media submission is loaded");
    return this.record;
  }

  private async saveSnapshot(snapshot: MediaSubmissionSnapshot, pendingCommand: PersistedMediaCommand | null = null): Promise<void> {
    const current = this.requireRecord();
    const sealed = snapshot.status !== "processing" || snapshot.phase !== "awaiting_upload";
    await this.save({
      ...current,
      submission_id: snapshot.submission_id,
      expected_creation_revision: snapshot.creation_revision,
      upload_status: sealed ? "sealed" : current.upload_status,
      snapshot,
      pending_command: pendingCommand,
      updated_at: this.now(),
    });
    this.setView(projectMediaSubmission(snapshot));
  }

  private commandAlreadyReflected(command: PersistedMediaCommand, snapshot: MediaSubmissionSnapshot): boolean {
    const commandBody = this.commandBody(command);
    const expected = typeof commandBody.expected_creation_revision === "number" ? commandBody.expected_creation_revision : null;
    if (command.kind === "finalize") return snapshot.status !== "processing" || snapshot.phase !== "awaiting_upload";
    if (command.kind === "cancel") return snapshot.status === "abandoned" || terminal(snapshot);
    if (command.kind === "retry" || command.kind === "terms" || command.kind === "lyrics") {
      return expected !== null && snapshot.creation_revision > expected;
    }
    return command.kind === "start";
  }

  private commandBody(command: PersistedMediaCommand): RevisionCommandBody {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(base64UrlToBytes(command.body_utf8_base64url)));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    // SAFETY: the representation was checked as an object; this internal read
    // only observes the optional numeric revision before replay.
    return parsed as RevisionCommandBody;
  }

  private async dispatch(command: PersistedMediaCommand): Promise<MediaCommandResult> {
    const current = this.requireRecord();
    if (current.pending_command?.body_sha256 !== command.body_sha256) {
      await this.save({
        ...current,
        commands: current.commands.some(saved => saved.body_sha256 === command.body_sha256) ? current.commands : [...current.commands, command],
        pending_command: command,
        updated_at: this.now(),
      });
    }
    this.setView({ status: "reconciling", ...(this.record?.submission_id === null ? {} : { submissionId: this.record?.submission_id ?? undefined }) });
    let result: MediaCommandResult;
    try {
      result = await this.transport.dispatch(command);
    } catch (error) {
      if (error instanceof MediaSubmissionConflictError) {
        const conflicted = this.requireRecord();
        await this.save({
          ...conflicted,
          issue: {
            kind: error.conflictKind,
            ...(error.submissionId === undefined ? {} : { submission_id: error.submissionId }),
          },
          updated_at: this.now(),
        });
      }
      throw error;
    }
    if (snapshotResult(result)) await this.saveSnapshot(result);
    return result;
  }

  private async reconcilePending(): Promise<void> {
    const current = this.requireRecord();
    const pending = current.pending_command;
    if (pending === null) return;
    if (current.submission_id !== null) {
      const snapshot = await this.transport.read(current.submission_id);
      if (snapshot !== null) {
        await this.saveSnapshot(snapshot, this.commandAlreadyReflected(pending, snapshot) ? null : pending);
        if (this.requireRecord().pending_command === null) return;
      }
    }
    const result = await this.dispatch(pending);
    if (!snapshotResult(result)) {
      const refreshed = this.requireRecord();
      await this.save({ ...refreshed, reservation: result, pending_command: null, updated_at: this.now() });
    }
  }

  async restore(draftId: string): Promise<PendingMediaSubmissionV1 | null> {
    const loaded = await this.storage.load(draftId);
    this.record = loaded;
    if (loaded === null) {
      this.setView({ status: "editing" });
      return null;
    }
    try {
      await this.reconcilePending();
      if (this.record?.submission_id !== null) await this.refresh();
    } catch (error) {
      if (!(error instanceof AmbiguousMediaSubmissionError)) throw error;
      this.setView({ status: "reconciling", ...(loaded.submission_id === null ? {} : { submissionId: loaded.submission_id }) });
    }
    return this.record;
  }

  async refresh(): Promise<MediaSubmissionSnapshot | null> {
    const current = this.requireRecord();
    if (current.submission_id === null) return null;
    const snapshot = await this.transport.read(current.submission_id);
    if (snapshot !== null) await this.saveSnapshot(snapshot, current.pending_command);
    return snapshot;
  }

  async begin(input: BeginSongSubmissionInput): Promise<MediaSubmissionSnapshot> {
    if (this.record !== null) throw new Error("Resolve the retained media submission before starting another");
    const createdAt = this.now();
    await this.save({
      version: MEDIA_PENDING_VERSION,
      draft_id: input.draftId,
      principal_id: input.principalId,
      community_id: input.communityId,
      persona_id: input.personaId,
      song_draft: { title: input.title, song_type: input.songType },
      audio: {
        blob: input.audio,
        name: input.audio.name,
        type: input.audio.type,
        size: input.audio.size,
        last_modified: input.audio.lastModified,
      },
      reservation: null,
      submission_id: null,
      expected_creation_revision: null,
      upload_status: "not_uploaded",
      snapshot: null,
      commands: [],
      pending_command: null,
      created_at: createdAt,
      updated_at: createdAt,
    });
    const reserveKey = this.createId();
    const reserveInput = buildReserveSongAudioInput({
      communityId: input.communityId,
      personaId: input.personaId,
      idempotencyKey: reserveKey,
      file: input.audio,
      expectedSha256: input.expectedSha256,
    });
    const reserve = await createPersistedMediaCommand({
      kind: "reserve",
      idempotencyKey: reserveKey,
      sameOriginPath: `/api/communities/${encodeURIComponent(reserveInput.path.communityId)}/media-upload-reservations`,
      body: reserveInput.body,
    });
    const reservationResult = await this.dispatch(reserve);
    if (snapshotResult(reservationResult)) throw new Error("Reservation command returned a submission snapshot");
    await this.save({ ...this.requireRecord(), reservation: reservationResult, pending_command: null, updated_at: this.now() });

    return this.ensureStarted();
  }

  async ensureStarted(): Promise<MediaSubmissionSnapshot> {
    await this.reconcilePending();
    const existing = this.requireRecord();
    if (existing.submission_id !== null) {
      const snapshot = await this.refresh();
      if (snapshot === null) throw new Error("The retained song submission could not be reconciled");
      return snapshot;
    }
    if (existing.reservation === null) throw new Error("The retained upload reservation could not be reconciled");

    const startKey = this.createId();
    const startInput = buildStartSongInput({
      communityId: existing.community_id,
      personaId: existing.persona_id,
      idempotencyKey: startKey,
      reservationId: existing.reservation.reservation_id,
      songType: existing.song_draft.song_type,
      title: existing.song_draft.title,
    });
    const start = await createPersistedMediaCommand({
      kind: "start",
      idempotencyKey: startKey,
      sameOriginPath: `/api/communities/${encodeURIComponent(existing.community_id)}/media-post-submissions`,
      body: startInput.body,
    });
    const submission = await this.dispatch(start);
    if (!snapshotResult(submission)) throw new Error("Start command returned an upload reservation");
    return submission;
  }

  async bindTerms(input: BindSongTermsInput): Promise<MediaSubmissionSnapshot> {
    await this.reconcilePending();
    const snapshot = await this.refresh();
    if (snapshot === null || terminal(snapshot)) throw new Error("Song terms cannot be changed for this submission");
    const commandKey = this.createId();
    const generated = buildSongTermsInput({
      submissionId: snapshot.submission_id,
      personaId: this.requireRecord().persona_id,
      idempotencyKey: commandKey,
      expectedCreationRevision: snapshot.creation_revision,
      ...input,
    });
    const command = await createPersistedMediaCommand({
      kind: "terms",
      idempotencyKey: commandKey,
      sameOriginPath: `/api/media-post-submissions/${encodeURIComponent(snapshot.submission_id)}/terms`,
      body: generated.body,
    });
    const result = await this.dispatch(command);
    if (!snapshotResult(result)) throw new Error("Terms command returned an upload reservation");
    return result;
  }

  async uploadAndFinalize(onProgress?: (sent: number, total: number) => void): Promise<MediaSubmissionSnapshot> {
    await this.reconcilePending();
    let snapshot = await this.refresh();
    const current = this.requireRecord();
    if (snapshot === null || current.reservation === null) throw new Error("The upload reservation or submission is missing");
    if (snapshot.status !== "processing" || snapshot.phase !== "awaiting_upload") return snapshot;
    if (current.upload_status !== "uploaded") {
      await this.save({ ...current, upload_status: "uploading", updated_at: this.now() });
      this.setView({ status: "uploading", submissionId: snapshot.submission_id, bytesSent: 0, bytesTotal: current.audio.size });
      await this.transport.upload(current.reservation, current.audio.blob, (sent, total) => {
        this.setView({ status: "uploading", submissionId: snapshot!.submission_id, bytesSent: sent, bytesTotal: total });
        onProgress?.(sent, total);
      });
      await this.save({ ...this.requireRecord(), upload_status: "uploaded", updated_at: this.now() });
    }
    snapshot = await this.refresh();
    if (snapshot === null || snapshot.status !== "processing" || snapshot.phase !== "awaiting_upload") return snapshot!;
    const commandKey = this.createId();
    const generated: PostMediaPostSubmissionsSubmissionIdFinalizeInput = {
      path: { submissionId: snapshot.submission_id },
      body: {
        persona_id: this.requireRecord().persona_id,
        idempotency_key: commandKey,
        expected_creation_revision: snapshot.creation_revision,
        reservation_id: this.requireRecord().reservation!.reservation_id,
      },
    };
    const command = await createPersistedMediaCommand({
      kind: "finalize",
      idempotencyKey: commandKey,
      sameOriginPath: `/api/media-post-submissions/${encodeURIComponent(snapshot.submission_id)}/finalize`,
      body: generated.body,
    });
    const result = await this.dispatch(command);
    if (!snapshotResult(result)) throw new Error("Finalize command returned an upload reservation");
    return result;
  }

  async bindLyrics(lyrics: string, mode: "accept_asr" | "paste" | "correct"): Promise<MediaSubmissionSnapshot> {
    await this.reconcilePending();
    const snapshot = await this.refresh();
    if (snapshot === null || snapshot.audio_revision < 1 || terminal(snapshot)) throw new Error("Lyrics cannot be bound before audio finalization");
    let baseTranscriptRevision: number | null = null;
    if (mode === "accept_asr") {
      const suggestion = snapshot.lyrics_state.asr_suggestion;
      if (suggestion.status !== "ready") throw new Error("An ASR suggestion is not ready");
      baseTranscriptRevision = suggestion.transcript_revision;
    } else if (mode === "correct" && snapshot.lyrics_state.current.status === "ready") {
      baseTranscriptRevision = snapshot.lyrics_state.current.base_transcript_revision;
    }
    const commandKey = this.createId();
    const generated = buildSongLyricsInput({
      submissionId: snapshot.submission_id,
      personaId: this.requireRecord().persona_id,
      idempotencyKey: commandKey,
      expectedCreationRevision: snapshot.creation_revision,
      expectedAudioRevision: snapshot.audio_revision,
      lyrics,
      baseTranscriptRevision,
    });
    const command = await createPersistedMediaCommand({
      kind: "lyrics",
      idempotencyKey: commandKey,
      sameOriginPath: `/api/media-post-submissions/${encodeURIComponent(snapshot.submission_id)}/lyrics`,
      body: generated.body,
    });
    const result = await this.dispatch(command);
    if (!snapshotResult(result)) throw new Error("Lyrics command returned an upload reservation");
    return result;
  }

  private async revisionCommand(kind: "retry" | "cancel"): Promise<MediaSubmissionSnapshot> {
    await this.reconcilePending();
    const snapshot = await this.refresh();
    if (snapshot === null) throw new Error("The media submission is unknown");
    if (kind === "retry" && (snapshot.status !== "processing_failed" || !snapshot.retryable)) throw new Error("This media failure is not retryable");
    if (kind === "cancel" && (snapshot.status !== "processing" || snapshot.phase !== "awaiting_upload")) throw new Error("This media submission can no longer be cancelled");
    const commandKey = this.createId();
    const generated: PostMediaPostSubmissionsSubmissionIdRetryInput | PostMediaPostSubmissionsSubmissionIdCancelInput = {
      path: { submissionId: snapshot.submission_id },
      body: { persona_id: this.requireRecord().persona_id, idempotency_key: commandKey, expected_creation_revision: snapshot.creation_revision },
    };
    const command = await createPersistedMediaCommand({
      kind,
      idempotencyKey: commandKey,
      sameOriginPath: `/api/media-post-submissions/${encodeURIComponent(snapshot.submission_id)}/${kind}`,
      body: generated.body,
    });
    const result = await this.dispatch(command);
    if (!snapshotResult(result)) throw new Error(`${kind} command returned an upload reservation`);
    return result;
  }

  retry(): Promise<MediaSubmissionSnapshot> { return this.revisionCommand("retry"); }
  cancel(): Promise<MediaSubmissionSnapshot> { return this.revisionCommand("cancel"); }

  async discardTerminal(): Promise<void> {
    const current = this.requireRecord();
    if (current.snapshot === null || !terminal(current.snapshot)) throw new Error("Only a terminal media submission may be discarded");
    await this.storage.remove(current.draft_id);
    this.record = null;
    this.setView({ status: "editing" });
  }
}

export function createMediaSubmissionCoordinator(options: MediaSubmissionCoordinatorOptions = {}): MediaSubmissionCoordinator {
  return new MediaSubmissionCoordinator(options);
}
