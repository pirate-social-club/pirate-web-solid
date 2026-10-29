import { captureSessionAuthority, isCurrentSessionAuthority } from "../../api/browser-session-events";
import type { DanceSession } from "./dance-preparation-api";
import { createDancePreparationJournal, danceConsentBody, danceJournalKey, type DanceJournalScope, type DanceJournalStore } from "./dance-preparation-journal";
import { decodeDanceRecordingMetadata, type createDanceRecordingController } from "./dance-recording";
import { createDanceUploadApi, putDanceRecording } from "./dance-upload-api";
import { createDanceUploadJournal, danceFinalizeBody, danceReserveBody, matchDanceUploadSession } from "./dance-upload-journal";

export type DanceUploadView = {
  readonly kind: "missing_recording" | "original_command_missing" | "processing" | "reconciling" | "unavailable" | "review" | "terminal" | "expired";
  readonly session: DanceSession;
};

export function danceUploadObservation(session: DanceSession, time: number): DanceUploadView | null {
  if (session.state === "terminal") return { kind: "terminal", session };
  if (session.state === "uploaded") return { kind: "review", session };
  if (!Number.isSafeInteger(time) || time < 0) throw new Error("dance_upload_clock_unavailable");
  if (time >= session.expires_at_ms) return { kind: "expired", session };
  if (session.upload_state === "sealing" || session.upload_state === "sealed") return { kind: "processing", session };
  if (session.upload_state === "unknown") return { kind: "reconciling", session };
  if (session.upload_state === "held" || session.upload_state === "deleted") return { kind: "unavailable", session };
  return null;
}

/** Explicit resume only. Every retry keeps the original reservation, file and
 * command keys. An unknown PUT is retried conditionally before sealing, because
 * Finalize queues processing and cannot be used to probe whether bytes exist. */
export function createDanceUploadController(options: {
  readonly scope: DanceJournalScope;
  readonly currentScope: () => DanceJournalScope | null;
  readonly store: DanceJournalStore;
  readonly recordings: Pick<ReturnType<typeof createDanceRecordingController>, "restore" | "cleanupExpired">;
  readonly api?: ReturnType<typeof createDanceUploadApi>;
  readonly put?: typeof putDanceRecording;
  readonly commandKey?: () => string;
  readonly nowMs?: () => number;
}) {
  const scope = Object.freeze({ ...options.scope }), key = danceJournalKey(scope), authority = captureSessionAuthority();
  const api = options.api ?? createDanceUploadApi(), put = options.put ?? putDanceRecording;
  const now = options.nowMs ?? Date.now, commandKey = options.commandKey ?? (() => crypto.randomUUID());
  const preparation = createDancePreparationJournal({ scope, currentScope: options.currentScope, store: options.store });
  let generation = 0;
  const state = (session: DanceSession) => danceUploadObservation(session, now());
  return {
    async resume(sessionId: string, signal: AbortSignal): Promise<DanceUploadView> {
      const selectedGeneration = ++generation;
      const assertScope = () => {
        signal.throwIfAborted(); const selected = options.currentScope();
        if (!isCurrentSessionAuthority(authority) || !selected || danceJournalKey(selected) !== key || generation !== selectedGeneration) throw new Error("dance_upload_scope_changed");
      };
      assertScope();
      const prep = preparation.read(), consent = prep && danceConsentBody(prep);
      if (!prep || prep.sessionId !== sessionId || !prep.consentReceiptId || !consent) throw new Error("dance_upload_consent_unconfirmed");
      const guard = () => {
        assertScope(); const retained = preparation.read();
        if (!retained || retained.revision !== prep.revision || retained.sessionId !== prep.sessionId
          || retained.consentReceiptId !== prep.consentReceiptId || retained.termsHash !== prep.termsHash) throw new Error("dance_upload_preparation_changed");
      };
      await options.recordings.cleanupExpired(signal); guard();
      const readSession = async () => {
        guard(); const session = await api.session(scope, sessionId, signal); guard();
        if (session.session_id !== sessionId || session.community_id !== scope.communityId || session.song_post_id !== scope.postId
          || session.choreography_id !== scope.choreographyId || session.choreography_revision !== scope.choreographyRevision
          || session.terms_hash !== prep.termsHash || session.policy_hash !== prep.policyHash
          || session.consent_version !== consent.consent_version || session.consent_hash !== consent.consent_hash || session.retention_hash !== consent.retention_hash) throw new Error("dance_upload_target_changed");
        return session;
      };
      const journal = createDanceUploadJournal({ scope, sessionId, store: options.store, assertCurrent: guard, commandKey });
      return journal.exclusive(async handle => {
        guard(); let entry = handle.read(), session = await readSession(); guard();
        if (entry) matchDanceUploadSession(decodeDanceRecordingMetadata(entry.recordingJson, scope.accountId), session, entry.uploadId);
        // A terminal/current uploaded result needs no replay or local bytes.
        // A pending finalize acknowledgement is replayed below before returning
        // nonterminal processing, so its original receipt remains recoverable.
        const observed = state(session);
        if (observed && (observed.kind === "terminal" || observed.kind === "review" || observed.kind === "expired")) return observed;
        let recording: Awaited<ReturnType<typeof options.recordings.restore>> = null;
        if (!entry) {
          if (observed) return observed;
          if (session.state !== "consented" || session.upload_id !== null) return { kind: "original_command_missing", session };
          recording = await options.recordings.restore(sessionId, signal); guard();
          if (!recording) return { kind: "missing_recording", session };
          matchDanceUploadSession(recording.metadata, session);
          if (recording.metadata.consentReceiptId !== prep.consentReceiptId) throw new Error("dance_upload_target_changed");
          entry = handle.initialize(recording.metadata);
        }
        const metadata = decodeDanceRecordingMetadata(entry.recordingJson, scope.accountId);
        if (metadata.consentReceiptId !== prep.consentReceiptId) throw new Error("dance_upload_target_changed");
        if (entry.reserveReceiptId === null) {
          const receipt = await api.reserve(scope, danceReserveBody(entry), signal); guard();
          entry = handle.acknowledgeReserve(receipt);
          session = await readSession(); guard(); matchDanceUploadSession(metadata, session, entry.uploadId);
        }
        let finalize = danceFinalizeBody(entry);
        if (finalize && entry.finalizeReceiptId === null) {
          const receipt = await api.finalize(scope, finalize, signal); guard();
          entry = handle.acknowledgeFinalize(receipt);
          session = await readSession(); guard(); matchDanceUploadSession(metadata, session, entry.uploadId);
        }
        const current = state(session); if (current) return current;
        if (entry.uploadId === null || session.state !== "awaiting_upload" || session.upload_state !== "reserved"
          || entry.finalizeReceiptId !== null) throw new Error("dance_upload_state_inconsistent");
        if (entry.putState === "not_started" || entry.putState === "unknown") {
          recording ??= await options.recordings.restore(sessionId, signal); guard();
          if (!recording) return { kind: "missing_recording", session };
          if (JSON.stringify(recording.metadata) !== entry.recordingJson) throw new Error("dance_upload_original_required");
          const access = await api.access(scope, sessionId, entry.uploadId, metadata.termsHash, signal); guard();
          entry = handle.beginPut();
          const outcome = await put({ access, uploadId: entry.uploadId!, blob: recording.blob, expiresAtMs: metadata.expiresAtMs,
            signal, assertCurrent: guard }, { nowMs: now }); guard();
          entry = handle.acknowledgePut(outcome);
        }
        entry = handle.prepareFinalize(); finalize = danceFinalizeBody(entry);
        if (!finalize) throw new Error("dance_upload_original_required");
        const receipt = await api.finalize(scope, finalize, signal); guard();
        entry = handle.acknowledgeFinalize(receipt);
        session = await readSession(); guard(); matchDanceUploadSession(metadata, session, entry.uploadId);
        const view = state(session); if (!view) throw new Error("dance_upload_state_inconsistent");
        return view;
      });
    },
  };
}
