import { ApiClientError } from "@pirate/api-client";
import { sha256Hex } from "../post-composer/text-submission-contract";
import { finalizeVideo, reserveOriginalVideo, reserveSongVideo, sameReservationPlan, SongReservationMismatch,
  startVideo, VideoContractError, type SongVideoSelection, type VideoPartReceipt, type VideoReservation,
  type VideoSnapshot } from "./contracts";
import { uploadVideoParts } from "./multipart";
import { isDefinitiveSongRefusal, type SongRejectionCode, songRefusalCode } from "./song-reference";
import type { VideoCommand, VideoCommandResult, VideoTransport } from "./transport";

/** Original-audio attempts keep their first version, so a take retained before
 * song-backed video existed restores unchanged. A song-backed attempt is its
 * own version and always carries the selection it reserved with. */
export const ORIGINAL_VIDEO_PENDING = "original-video-pending-v1";
export const SONG_VIDEO_PENDING = "song-video-pending-v1";

export interface PendingVideo {
  readonly version: typeof ORIGINAL_VIDEO_PENDING | typeof SONG_VIDEO_PENDING;
  readonly principalId: string;
  readonly communityId: string;
  readonly personaId: string;
  readonly file: File;
  readonly caption: string;
  readonly rating: "general" | "adult_18";
  /** Present exactly when `version` is the song-backed one. */
  readonly song?: SongVideoSelection;
  readonly reservation: VideoReservation | null;
  readonly snapshot: VideoSnapshot | null;
  readonly receipts: readonly VideoPartReceipt[];
  readonly pending: { readonly command: VideoCommand; readonly digest: string } | null;
  readonly rejection?: {
    readonly command: VideoCommand;
    readonly digest: string;
    readonly status: number;
    readonly code: string;
    /** Why a song was refused, when the refusal named a song reason. */
    readonly reasonCode?: SongRejectionCode;
  };
}

export function isRetainedVersion(record: Pick<PendingVideo, "version" | "song">): boolean {
  return record.version === ORIGINAL_VIDEO_PENDING
    ? record.song === undefined
    : record.version === SONG_VIDEO_PENDING && record.song !== undefined;
}
export interface VideoStorage {
  readonly exclusive: <T>(work: () => Promise<T>) => Promise<T>;
  readonly load: () => Promise<PendingVideo | null>;
  readonly save: (record: PendingVideo) => Promise<void>;
  readonly remove: () => Promise<void>;
}

function snapshotResult(result: VideoCommandResult): result is VideoSnapshot { return "submission_id" in result; }
export function canDiscardRejectedVideo(record: PendingVideo | null): boolean {
  return record !== null && record.pending === null && record.snapshot === null
    && (record.rejection?.command.kind === "reserve" || record.rejection?.command.kind === "start");
}
const terminal = (snapshot: VideoSnapshot) => ["published", "blocked", "abandoned"].includes(snapshot.status);
async function commandDigest(command: VideoCommand): Promise<string> {
  return sha256Hex(new TextEncoder().encode(JSON.stringify(command)));
}

/** One serialized writer; failures retain the exact command for replay. */
export class VideoCoordinator {
  private record: PendingVideo | null = null;
  private busy = false;
  private uploadAbort: AbortController | null = null;
  private pauseRevision = 0;
  private operationRevision = 0;
  private assertActive(): void {
    if (this.operationRevision !== this.pauseRevision) throw new VideoContractError("Video operation paused; resume the retained attempt explicitly");
  }
  constructor(private readonly options: {
    readonly principalId: string;
    readonly storage: VideoStorage;
    readonly transport: VideoTransport;
    readonly createId?: () => string;
    readonly fetchImpl?: typeof fetch;
    readonly now?: () => number;
    readonly onChange?: (record: PendingVideo | null) => void;
    readonly onProgress?: (sent: number, total: number) => void;
  }) {}
  get current(): PendingVideo | null { return this.record; }
  private key(): string { return this.options.createId?.() ?? crypto.randomUUID(); }
  private require(): PendingVideo {
    if (!this.record) throw new VideoContractError("No retained video attempt");
    return this.record;
  }
  private async save(record: PendingVideo): Promise<void> {
    await this.options.storage.save(record);
    this.record = record;
    this.options.onChange?.(record);
  }
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.busy) throw new VideoContractError("A video command is already in progress");
    this.busy = true;
    this.operationRevision = this.pauseRevision;
    try {
      return await this.options.storage.exclusive(async () => {
        const stored = await this.options.storage.load();
        if (stored && (!isRetainedVersion(stored) || stored.principalId !== this.options.principalId)) {
          throw new VideoContractError("Retained video belongs to a different account or version");
        }
        this.record = stored;
        this.options.onChange?.(stored);
        this.assertActive();
        return work();
      });
    } finally { this.busy = false; }
  }
  private async execute(command: VideoCommand): Promise<VideoCommandResult> {
    this.assertActive();
    const current = this.require();
    if (current.pending && await commandDigest(command) !== current.pending.digest) {
      throw new VideoContractError("Reconcile the retained command before issuing another");
    }
    await this.save({ ...current, pending: { command, digest: await commandDigest(command) } });
    this.assertActive();
    let result: VideoCommandResult;
    try { result = await this.options.transport.execute(command); }
    catch (error) {
      // Only a generated, declared non-retryable client rejection proves this
      // command was refused. Conflicts may name an existing operation; keep
      // them, transport failures and unexpected/malformed responses for replay.
      // Two exceptions are definitive for a song: a conflict naming a changed
      // song revision or unmeasurable audio, and a reservation that froze a
      // different song or excerpt, which replaying would only repeat.
      if (error instanceof ApiClientError && !error.retryable && error.status >= 400 && error.status < 500
        && (![408, 409, 429].includes(error.status) || isDefinitiveSongRefusal(error))) {
        const rejection: NonNullable<PendingVideo["rejection"]> = {
          command, digest: await commandDigest(command), status: error.status, code: error.code,
        };
        const reasonCode = songRefusalCode(error);
        await this.save({ ...this.require(), pending: null,
          rejection: reasonCode === undefined ? rejection : { ...rejection, reasonCode } });
      } else if (error instanceof SongReservationMismatch) {
        await this.save({ ...this.require(), pending: null, rejection: {
          command, digest: await commandDigest(command), status: 0, code: "contract", reasonCode: "song_reference_mismatch",
        } });
      }
      throw error;
    }
    let next = this.require();
    if (snapshotResult(result)) {
      if (result.author_persona.persona_id !== next.personaId
        || (next.snapshot !== null && result.submission_id !== next.snapshot.submission_id)) {
        throw new VideoContractError("Response changed video operation authority");
      }
      next = { ...next, snapshot: result };
    } else {
      if (result.author_persona_id !== next.personaId) throw new VideoContractError("Response changed reservation authority");
      if (result.intent !== (next.song === undefined ? "original_audio" : "song_reference")) {
        throw new VideoContractError("Response changed whether this video is posted to a song");
      }
      if (next.reservation && (next.reservation.reservation_id !== result.reservation_id
        || next.reservation.upload.upload_id !== result.upload.upload_id
        || next.reservation.upload.part_count !== result.upload.part_count
        || next.reservation.upload.part_size_bytes !== result.upload.part_size_bytes
        || !sameReservationPlan(next.reservation, result))) {
        throw new VideoContractError("Renewal changed the immutable upload plan");
      }
      if (command.kind === "renew" && next.reservation) {
        const renewed = new Map(result.upload.parts.map(part => [part.part_number, part]));
        if (renewed.size !== command.input.body.part_numbers.length
          || command.input.body.part_numbers.some(number => !renewed.has(number))) {
          throw new VideoContractError("Renewal returned a different set of upload parts");
        }
        next = { ...next, reservation: { ...result, upload: { ...result.upload,
          parts: next.reservation.upload.parts.map(part => renewed.get(part.part_number) ?? part),
        } } };
      } else next = { ...next, reservation: result };
    }
    const { rejection: _rejection, ...accepted } = next;
    await this.save({ ...accepted, pending: null });
    this.assertActive();
    return result;
  }
  private async reconcile(): Promise<void> {
    const pending = this.require().pending;
    if (!pending) return;
    if (await commandDigest(pending.command) !== pending.digest) throw new VideoContractError("Retained command digest mismatch");
    await this.execute(pending.command);
  }
  async restore(): Promise<PendingVideo | null> {
    return this.exclusive(async () => {
      const record = await this.options.storage.load();
      if (!record) return null;
      if (!isRetainedVersion(record) || record.principalId !== this.options.principalId) {
        throw new VideoContractError("Retained video belongs to a different account or version");
      }
      this.record = record;
      this.options.onChange?.(record);
      await this.reconcile();
      await this.refreshSnapshot();
      return this.record;
    });
  }
  /** Starts an attempt. With `song`, the reservation asks the server to post
   * this video to that song; without it, the video publishes its own sound. */
  async begin(input: Pick<PendingVideo, "communityId" | "personaId" | "file" | "caption" | "rating" | "song">): Promise<void> {
    return this.exclusive(async () => {
      if (this.record || await this.options.storage.load()) throw new VideoContractError("Resolve the retained video before starting another");
      const { song, ...common } = input;
      const reserve = song === undefined
        ? reserveOriginalVideo({ ...common, key: this.key() })
        : reserveSongVideo({ ...common, song, key: this.key() });
      if (input.caption.length > 2200) throw new VideoContractError("Caption exceeds 2200 characters");
      const command: VideoCommand = { kind: "reserve", input: reserve };
      await this.save({ ...common, ...(song === undefined ? { version: ORIGINAL_VIDEO_PENDING } : { version: SONG_VIDEO_PENDING, song }),
        principalId: this.options.principalId,
        reservation: null, snapshot: null, receipts: [], pending: { command, digest: await commandDigest(command) },
      });
      await this.execute(command);
    });
  }
  private async refreshSnapshot(): Promise<VideoSnapshot | null> {
    const record = this.require();
    if (!record.snapshot) return null;
    this.assertActive();
    const snapshot = await this.options.transport.read(record.snapshot.submission_id);
    if (snapshot.submission_id !== record.snapshot.submission_id || snapshot.author_persona.persona_id !== record.personaId) {
      throw new VideoContractError("Read changed video operation authority");
    }
    if (snapshot.creation_revision >= record.snapshot.creation_revision) await this.save({ ...record, snapshot });
    this.assertActive();
    return this.require().snapshot;
  }
  refresh(): Promise<VideoSnapshot | null> { return this.exclusive(() => this.refreshSnapshot()); }
  /** Stop bytes and later effects; retain received outcomes and commands for explicit resume. */
  pauseUpload(): void { this.pauseRevision++; this.uploadAbort?.abort(); }
  async submit(): Promise<VideoSnapshot> {
    return this.exclusive(async () => {
      await this.reconcile();
      let record = this.require();
      if (record.rejection) throw new VideoContractError("The saved video command was rejected. Resolve it explicitly before continuing.");
      if (!record.reservation) throw new VideoContractError("Reservation has not been reconciled");
      if (!record.snapshot) {
        await this.execute({ kind: "start", input: startVideo({ ...record, reservation: record.reservation, key: this.key() }) });
      }
      const snapshot = await this.refreshSnapshot();
      if (!snapshot) throw new VideoContractError("Submission has not been reconciled");
      if (snapshot.status !== "processing" || snapshot.phase !== "awaiting_upload") return snapshot;
      record = this.require();
      const reservation = record.reservation!;
      this.uploadAbort = new AbortController();
      let parts: readonly VideoPartReceipt[];
      try {
        parts = await uploadVideoParts({ reservation, file: record.file, receipts: record.receipts,
          fetchImpl: this.options.fetchImpl, now: this.options.now, signal: this.uploadAbort.signal,
          onProgress: this.options.onProgress,
          saveReceipt: async receipt => { await this.save({ ...this.require(), receipts: [...this.require().receipts, receipt] }); },
          renew: async partNumbers => {
            const result = await this.execute({ kind: "renew", input: {
              path: { reservationId: reservation.reservation_id },
              body: { reservation_id: reservation.reservation_id, persona_id: record.personaId, idempotency_key: this.key(), part_numbers: partNumbers },
            } });
            if (snapshotResult(result)) throw new VideoContractError("Unexpected renewal result");
            return result.upload.parts.filter(part => partNumbers.includes(part.part_number));
          },
        });
      } finally { this.uploadAbort = null; }
      const latest = await this.refreshSnapshot();
      if (!latest) throw new VideoContractError("Submission could not be checked before finalize");
      if (latest.status !== "processing" || latest.phase !== "awaiting_upload") return latest;
      const result = await this.execute({ kind: "finalize", input: finalizeVideo({
        personaId: record.personaId, key: this.key(), snapshot: latest, reservation, parts,
      }) });
      if (!snapshotResult(result)) throw new VideoContractError("Unexpected finalize response");
      return result;
    });
  }
  async revisionCommand(kind: "retry" | "cancel"): Promise<VideoSnapshot> {
    return this.exclusive(async () => {
      await this.reconcile();
      const snapshot = await this.refreshSnapshot();
      if (!snapshot) throw new VideoContractError("No server submission to change");
      if (kind === "cancel" && (snapshot.status !== "processing" || snapshot.phase !== "awaiting_upload")) throw new VideoContractError("Video can no longer be cancelled");
      if (kind === "retry" && (snapshot.status !== "processing_failed" || !snapshot.retryable)) throw new VideoContractError("Video cannot be retried");
      const result = await this.execute({ kind, input: { path: { submissionId: snapshot.submission_id }, body: {
        persona_id: this.require().personaId, idempotency_key: this.key(), expected_creation_revision: snapshot.creation_revision,
      } } });
      if (!snapshotResult(result)) throw new VideoContractError("Unexpected video command response");
      return result;
    });
  }
  async discard(): Promise<void> {
    return this.exclusive(async () => {
      await this.reconcile();
      const snapshot = await this.refreshSnapshot();
      if (!snapshot || !terminal(snapshot)) throw new VideoContractError("Only a terminal video attempt can be discarded");
      await this.options.storage.remove(); this.record = null; this.options.onChange?.(null);
    });
  }
  /** Explicit edit/discard after a refused reserve/start; never on ambiguity. */
  async discardRejected(): Promise<PendingVideo> {
    return this.exclusive(async () => {
      const record = this.require();
      if (!canDiscardRejectedVideo(record) || !record.rejection
        || await commandDigest(record.rejection.command) !== record.rejection.digest) {
        throw new VideoContractError("Only a definitively rejected reservation or start can be discarded");
      }
      await this.options.storage.remove(); this.record = null; this.options.onChange?.(null);
      return record;
    });
  }
}
