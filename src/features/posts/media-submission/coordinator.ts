import type {
  PostMediaPostSubmissionsSubmissionIdCancelInput,
  PostMediaPostSubmissionsSubmissionIdFinalizeInput,
  PostMediaPostSubmissionsSubmissionIdRetryInput,
  PostMediaPostSubmissionsSubmissionIdReferenceInput,
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
  createPersistedMediaCommand,
  MEDIA_PENDING_VERSION,
  type PendingMediaSubmissionV1,
  type PersistedMediaCommand,
} from "./pending";
import { projectMediaSubmission, type SongSubmissionView } from "./projection";
import {
  createSameOriginMediaSubmissionTransport,
  MediaSubmissionConflictError,
  RejectedMediaSubmissionError,
  type MediaCommandResult,
  type MediaSubmissionTransport,
} from "./transport";

export interface BeginSongSubmissionInput {
  readonly communityId: string;
  readonly personaId: string;
  readonly audio: File;
  readonly title: string;
  readonly songType: "original" | "remix";
  readonly authorDeclaredRating: "general" | "adult_18";
  readonly expectedSha256?: string;
}

export interface BindSongTermsInput {
  readonly licensePreset: SongLicensePreset;
  readonly commercialRevShareBps?: number;
  readonly allocations: readonly SongRoyaltyAllocation[];
}

export interface MediaSubmissionCoordinatorOptions {
  readonly transport?: MediaSubmissionTransport;
  readonly origin?: string | URL;
  readonly fetchImpl?: typeof fetch;
  readonly createId?: () => string;
  readonly onStateChange?: (view: SongSubmissionView) => void;
  readonly onSnapshotChange?: (snapshot: MediaSubmissionSnapshot) => void;
}

interface RevisionCommandBody {
  readonly expected_creation_revision?: number;
  readonly lyrics?: unknown;
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

const FINALIZE_OBSERVATION_INTERVAL_MS = 250;

function finalizeObservationTick(): Promise<{ readonly kind: "tick" }> {
  return new Promise(resolve => {
    setTimeout(() => resolve({ kind: "tick" }), FINALIZE_OBSERVATION_INTERVAL_MS);
  });
}

/**
 * Owns one song upload and publication for the life of the composer. The
 * in-memory record retains each issued command's exact body and idempotency
 * key, so a lost response is reconciled or replayed as the same operation
 * instead of a second upload. It is not a draft and never survives the dialog.
 */
export class MediaSubmissionCoordinator {
  readonly transport: MediaSubmissionTransport;
  private record: PendingMediaSubmissionV1 | null = null;
  private view: SongSubmissionView = { status: "editing" };
  private readonly createId: () => string;
  private readonly onStateChange?: (view: SongSubmissionView) => void;
  private readonly onSnapshotChange?: (snapshot: MediaSubmissionSnapshot) => void;

  constructor(options: MediaSubmissionCoordinatorOptions = {}) {
    this.transport = options.transport ?? createSameOriginMediaSubmissionTransport({ origin: options.origin, fetchImpl: options.fetchImpl });
    this.createId = options.createId ?? randomId;
    this.onStateChange = options.onStateChange;
    this.onSnapshotChange = options.onSnapshotChange;
  }

  get currentRecord(): PendingMediaSubmissionV1 | null { return this.record; }
  get state(): SongSubmissionView { return this.view; }

  private setView(view: SongSubmissionView): void {
    this.view = view;
    this.onStateChange?.(view);
  }

  private save(next: PendingMediaSubmissionV1): void {
    this.record = next;
  }

  private requireRecord(): PendingMediaSubmissionV1 {
    if (this.record === null) throw new Error("No media submission is loaded");
    return this.record;
  }

  private saveSnapshot(snapshot: MediaSubmissionSnapshot, pendingCommand: PersistedMediaCommand | null = null): void {
    const current = this.requireRecord();
    const retainedSnapshot = !terminal(snapshot)
      && snapshot.lyrics_state.current.status !== "no_lyrics"
      && current.snapshot !== null
      && (current.snapshot.creation_revision > snapshot.creation_revision
        || (current.snapshot.creation_revision === snapshot.creation_revision
          && current.snapshot.audio_revision > snapshot.audio_revision))
      ? current.snapshot
      : snapshot;
    const sealed = retainedSnapshot.status !== "processing" || retainedSnapshot.phase !== "awaiting_upload";
    this.save({
      ...current,
      submission_id: retainedSnapshot.submission_id,
      upload_status: sealed ? "sealed" : current.upload_status,
      snapshot: retainedSnapshot,
      pending_command: pendingCommand,
    });
    this.onSnapshotChange?.(retainedSnapshot);
    this.setView(projectMediaSubmission(retainedSnapshot));
  }

  private commandAlreadyReflected(command: PersistedMediaCommand, snapshot: MediaSubmissionSnapshot): boolean {
    const commandBody = this.commandBody(command);
    const expected = typeof commandBody.expected_creation_revision === "number" ? commandBody.expected_creation_revision : null;
    if (command.kind === "finalize") return snapshot.status !== "processing" || snapshot.phase !== "awaiting_upload";
    if (command.kind === "cancel") return snapshot.status === "abandoned" || terminal(snapshot);
    if (command.kind === "lyrics") {
      return expected !== null
        && typeof commandBody.lyrics === "string"
        && snapshot.creation_revision > expected
        && snapshot.lyrics_state.current.status === "ready"
        && snapshot.lyrics_state.current.text === commandBody.lyrics;
    }
    if (command.kind === "retry" || command.kind === "terms") {
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
      this.save({
        ...current,
        commands: current.commands.some(saved => saved.body_sha256 === command.body_sha256) ? current.commands : [...current.commands, command],
        pending_command: command,
      });
    }
    this.setView({ status: "reconciling", ...(this.record?.submission_id === null ? {} : { submissionId: this.record?.submission_id ?? undefined }) });
    let result: MediaCommandResult;
    try {
      result = await this.transport.dispatch(command);
    } catch (error) {
      if (
        error instanceof MediaSubmissionConflictError ||
        error instanceof RejectedMediaSubmissionError
      ) {
        // A definitive client or idempotency rejection can never succeed on
        // replay. Before start there is no server submission to retain; after
        // start, restore the last authoritative snapshot and let the author
        // correct and issue a fresh command.
        const rejected = this.requireRecord();
        if (rejected.submission_id === null) {
          this.record = null;
          this.setView({ status: "editing" });
        } else {
          this.save({
            ...rejected,
            commands: rejected.commands.filter(saved => saved.body_sha256 !== command.body_sha256),
            pending_command: null,
          });
          if (rejected.snapshot !== null) this.setView(projectMediaSubmission(rejected.snapshot));
        }
      }
      throw error;
    }
    if (snapshotResult(result)) {
      const pending = this.requireRecord().pending_command;
      this.saveSnapshot(
        result,
        pending?.body_sha256 === command.body_sha256 ? null : pending,
      );
    }
    return result;
  }

  private async dispatchFinalize(command: PersistedMediaCommand): Promise<MediaCommandResult> {
    const finalization = this.dispatch(command);
    const settled = finalization.then(
      result => ({ kind: "result" as const, result }),
      error => ({ kind: "error" as const, error }),
    );
    while (true) {
      const outcome = await Promise.race([settled, finalizeObservationTick()]);
      if (outcome.kind === "result") {
        return snapshotResult(outcome.result)
          ? this.requireRecord().snapshot ?? outcome.result
          : outcome.result;
      }
      if (outcome.kind === "error") throw outcome.error;

      const current = this.requireRecord();
      if (current.submission_id === null) continue;
      try {
        const observed = await this.transport.read(current.submission_id);
        if (observed === null) continue;
        this.saveSnapshot(observed, this.requireRecord().pending_command);
        if (observed.audio_revision >= 1 || terminal(observed)) {
          // The read is authoritative evidence that this exact finalize took
          // effect. Do not keep the author blocked on a delayed response after
          // the server has already exposed the result.
          return this.requireRecord().snapshot ?? observed;
        }
      } catch {
        // The authoritative finalize request owns the result. A transient
        // observation failure cannot replace or cancel that retained command.
      }
    }
  }

  private async reconcilePending(): Promise<void> {
    const current = this.requireRecord();
    const pending = current.pending_command;
    if (pending === null) return;
    if (current.submission_id !== null) {
      const snapshot = await this.transport.read(current.submission_id);
      if (snapshot !== null) {
        this.saveSnapshot(snapshot, this.commandAlreadyReflected(pending, snapshot) ? null : pending);
        if (this.requireRecord().pending_command === null) return;
      }
    }
    const result = await this.dispatch(pending);
    if (!snapshotResult(result)) {
      this.save({ ...this.requireRecord(), reservation: result, pending_command: null });
    }
  }

  async refresh(): Promise<MediaSubmissionSnapshot | null> {
    const current = this.requireRecord();
    if (current.submission_id === null) return null;
    const snapshot = await this.transport.read(current.submission_id);
    if (snapshot !== null) this.saveSnapshot(snapshot, this.requireRecord().pending_command);
    return snapshot === null ? null : this.requireRecord().snapshot;
  }

  async begin(input: BeginSongSubmissionInput): Promise<MediaSubmissionSnapshot> {
    if (this.record !== null) throw new Error("Resolve the active media submission before starting another");
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
    this.save({
      version: MEDIA_PENDING_VERSION,
      community_id: input.communityId,
      persona_id: input.personaId,
      song_draft: {
        title: input.title,
        song_type: input.songType,
        author_declared_rating: input.authorDeclaredRating,
      },
      audio: {
        blob: input.audio,
        name: input.audio.name,
        type: input.audio.type,
        size: input.audio.size,
        last_modified: input.audio.lastModified,
      },
      reservation: null,
      submission_id: null,
      upload_status: "not_uploaded",
      snapshot: null,
      commands: [],
      pending_command: null,
    });
    const reservationResult = await this.dispatch(reserve);
    if (snapshotResult(reservationResult)) throw new Error("Reservation command returned a submission snapshot");
    this.save({ ...this.requireRecord(), reservation: reservationResult, pending_command: null });

    return this.ensureStarted();
  }

  async ensureStarted(): Promise<MediaSubmissionSnapshot> {
    await this.reconcilePending();
    const existing = this.requireRecord();
    if (existing.submission_id !== null) {
      const snapshot = await this.refresh();
      if (snapshot === null) throw new Error("The active song submission could not be reconciled");
      return snapshot;
    }
    if (existing.reservation === null) throw new Error("The active upload reservation could not be reconciled");

    const startKey = this.createId();
    const startInput = buildStartSongInput({
      communityId: existing.community_id,
      personaId: existing.persona_id,
      idempotencyKey: startKey,
      reservationId: existing.reservation.reservation_id,
      songType: existing.song_draft.song_type,
      title: existing.song_draft.title,
      authorDeclaredRating: existing.song_draft.author_declared_rating,
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

  async uploadAndFinalize(
    onProgress?: (sent: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<MediaSubmissionSnapshot> {
    await this.reconcilePending();
    let snapshot = await this.refresh();
    const current = this.requireRecord();
    if (snapshot === null || current.reservation === null) throw new Error("The upload reservation or submission is missing");
    if (snapshot.status !== "processing" || snapshot.phase !== "awaiting_upload") return snapshot;
    if (current.upload_status !== "uploaded") {
      if (Date.parse(current.reservation.upload.expires_at) <= Date.now()) {
        throw new Error("The upload reservation expired. Cancel this submission and start again.");
      }
      this.save({ ...current, upload_status: "uploading" });
      this.setView({ status: "uploading", submissionId: snapshot.submission_id, bytesSent: 0, bytesTotal: current.audio.size });
      try {
        await this.transport.upload(
          current.reservation,
          current.audio.blob,
          (sent, total) => {
            this.setView({ status: "uploading", submissionId: snapshot!.submission_id, bytesSent: sent, bytesTotal: total });
            onProgress?.(sent, total);
          },
          signal,
        );
      } catch (error) {
        // The retained Blob and reservation make the same PUT retryable. Do
        // not leave the composer in its transient progress-only state when a
        // browser, CORS, or response failure makes the result ambiguous.
        this.save({ ...this.requireRecord(), upload_status: "not_uploaded" });
        this.setView(projectMediaSubmission(snapshot));
        throw error;
      }
      this.save({ ...this.requireRecord(), upload_status: "uploaded" });
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
    const result = await this.dispatchFinalize(command);
    if (!snapshotResult(result)) throw new Error("Finalize command returned an upload reservation");
    return result;
  }

  async bindLyrics(lyrics: string, _mode: "paste" | "correct"): Promise<MediaSubmissionSnapshot> {
    await this.reconcilePending();
    const snapshot = await this.refresh();
    if (snapshot === null || snapshot.audio_revision < 1 || terminal(snapshot)) throw new Error("Lyrics cannot be bound before audio finalization");
    const commandKey = this.createId();
    const generated = buildSongLyricsInput({
      submissionId: snapshot.submission_id,
      personaId: this.requireRecord().persona_id,
      idempotencyKey: commandKey,
      expectedCreationRevision: snapshot.creation_revision,
      expectedAudioRevision: snapshot.audio_revision,
      lyrics,
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

  async bindReference(upstreamAssetId: string): Promise<MediaSubmissionSnapshot> {
    await this.reconcilePending();
    const snapshot = await this.refresh();
    if (snapshot?.status !== "action_required" || snapshot.action.kind !== "reference_required") {
      if (snapshot !== null) return snapshot;
      throw new Error("The song reference request could not be read");
    }
    const assetId = upstreamAssetId.trim();
    if (!assetId || assetId.length > 128) throw new Error("Enter the source song asset identifier");
    const idempotencyKey = this.createId();
    const generated: PostMediaPostSubmissionsSubmissionIdReferenceInput = {
      path: { submissionId: snapshot.submission_id },
      body: { persona_id: this.requireRecord().persona_id, idempotency_key: idempotencyKey,
        expected_creation_revision: snapshot.creation_revision,
        reference_request_ref: snapshot.action.reference_request_ref, upstream_asset_id: assetId },
    };
    const command = await createPersistedMediaCommand({ kind: "reference", idempotencyKey,
      sameOriginPath: `/api/media-post-submissions/${encodeURIComponent(snapshot.submission_id)}/reference`, body: generated.body });
    const result = await this.dispatch(command);
    if (!snapshotResult(result)) throw new Error("Reference binding returned an upload reservation");
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

  discardTerminal(): void {
    const current = this.requireRecord();
    if (
      current.snapshot === null ||
      (!terminal(current.snapshot) && current.snapshot.status !== "processing_failed")
    ) throw new Error("Only a terminal media submission may be discarded");
    this.record = null;
    this.setView({ status: "editing" });
  }
}

export function createMediaSubmissionCoordinator(options: MediaSubmissionCoordinatorOptions = {}): MediaSubmissionCoordinator {
  return new MediaSubmissionCoordinator(options);
}
