import { decodeJournalRecord, journalChoice, journalHash, journalIdentifier, journalInteger, journalLiteral, parseJournalJson, type JournalFields, type JournalRule } from "../../api/contribution-command-codec";
import { danceJournalKey, type DanceJournalScope, type DanceJournalStore } from "./dance-preparation-journal";
import type { DanceSession } from "./dance-preparation-api";
import { decodeDanceRecordingMetadata, type DanceRecordingMetadata } from "./dance-recording";
import type { DanceFinalizeCommand, DanceReserveCommand, DanceUploadReceipt } from "./dance-upload-api";

export interface DanceUploadEntry {
  readonly version: 1;
  readonly revision: number;
  readonly recordingJson: string;
  readonly reserveJson: string;
  readonly reserveReceiptId: string | null;
  readonly uploadId: string | null;
  readonly putState: "not_started" | "unknown" | "stored" | "already_present";
  readonly finalizeJson: string | null;
  readonly finalizeReceiptId: string | null;
}
const corrupt = () => new Error("dance_upload_journal_corrupt");
const text: JournalRule<string> = (value): value is string => typeof value === "string";
const positive: JournalRule<number> = (value): value is number => journalInteger(value) && value > 0;
const nullable = (rule: JournalRule<string>): JournalRule<string | null> => (value): value is string | null => value === null || rule(value);
const common = { version: journalLiteral("dance-moderated-intake-v1"), idempotency_key: journalIdentifier,
  community_id: journalIdentifier, session_id: journalIdentifier, terms_hash: journalHash };
const reserveFields = { ...common, operation: journalLiteral("reserve"), content_type: journalChoice(["video/mp4", "video/quicktime"]), size_bytes: positive, duration_ms: positive } satisfies JournalFields<DanceReserveCommand>;
const finalizeFields = { ...common, operation: journalLiteral("finalize"), upload_id: journalIdentifier } satisfies JournalFields<DanceFinalizeCommand>;
const fields = { version: journalLiteral(1), revision: journalInteger, recordingJson: text, reserveJson: text,
  reserveReceiptId: nullable(journalIdentifier), uploadId: nullable(journalIdentifier), putState: journalChoice(["not_started", "unknown", "stored", "already_present"]),
  finalizeJson: nullable(text), finalizeReceiptId: nullable(journalIdentifier) } satisfies JournalFields<DanceUploadEntry>;
const decode = <T extends object>(raw: string, rules: JournalFields<T>): T => {
  try { return decodeJournalRecord<T>(parseJournalJson(raw), rules); } catch { throw corrupt(); }
};
export const danceUploadKey = (scope: DanceJournalScope, sessionId: string) => `${danceJournalKey(scope)}:upload:${sessionId}`;
export const danceReserveBody = (entry: DanceUploadEntry) => decode<DanceReserveCommand>(entry.reserveJson, reserveFields);
export const danceFinalizeBody = (entry: DanceUploadEntry) => entry.finalizeJson === null ? null : decode<DanceFinalizeCommand>(entry.finalizeJson, finalizeFields);
export function matchDanceUploadSession(metadata: DanceRecordingMetadata, session: DanceSession, uploadId?: string | null): void {
  if (session.session_id !== metadata.sessionId || session.community_id !== metadata.communityId || session.song_post_id !== metadata.postId
    || session.choreography_id !== metadata.choreographyId || session.choreography_revision !== metadata.choreographyRevision
    || session.terms_hash !== metadata.termsHash || session.policy_hash !== metadata.policyHash
    || session.consent_version !== metadata.consentVersion || session.consent_hash !== metadata.consentHash || session.retention_hash !== metadata.retentionHash
    || session.body_end_ms !== metadata.durationMs || session.expires_at_ms !== metadata.expiresAtMs
    || (uploadId != null && session.upload_id !== uploadId)) throw new Error("dance_upload_target_changed");
}

export function decodeDanceUploadEntry(raw: string, scope: DanceJournalScope, sessionId: string): DanceUploadEntry {
  const entry = decode<DanceUploadEntry>(raw, fields), metadata = decodeDanceRecordingMetadata(entry.recordingJson, scope.accountId);
  const reserve = danceReserveBody(entry), finalize = danceFinalizeBody(entry);
  if (danceJournalKey(metadata) !== danceJournalKey(scope) || metadata.sessionId !== sessionId
    || reserve.community_id !== scope.communityId || reserve.session_id !== sessionId || reserve.terms_hash !== metadata.termsHash
    || reserve.content_type !== "video/mp4" || reserve.size_bytes !== metadata.byteLength || reserve.duration_ms !== metadata.durationMs
    || (entry.reserveReceiptId === null) !== (entry.uploadId === null)
    || (entry.uploadId === null && (entry.putState !== "not_started" || finalize !== null))
    || (finalize !== null && (entry.putState === "not_started" || entry.putState === "unknown"
      || finalize.community_id !== scope.communityId || finalize.session_id !== sessionId || finalize.terms_hash !== metadata.termsHash || finalize.upload_id !== entry.uploadId))
    || (entry.finalizeReceiptId !== null && finalize === null)) throw corrupt();
  return entry;
}

/** Command metadata only; fresh signed upload URLs are never retained. */
export function createDanceUploadJournal(options: { readonly scope: DanceJournalScope; readonly sessionId: string;
  readonly store: DanceJournalStore; readonly assertCurrent: () => void; readonly commandKey: () => string }) {
  const scope = Object.freeze({ ...options.scope }), sessionId = options.sessionId, key = danceUploadKey(scope, sessionId), store = options.store;
  return {
    async exclusive<T>(use: (handle: {
      read(): DanceUploadEntry | null;
      initialize(metadata: DanceRecordingMetadata): DanceUploadEntry;
      acknowledgeReserve(receipt: DanceUploadReceipt): DanceUploadEntry;
      beginPut(): DanceUploadEntry;
      acknowledgePut(state: "stored" | "already_present"): DanceUploadEntry;
      prepareFinalize(): DanceUploadEntry;
      acknowledgeFinalize(receipt: DanceUploadReceipt): DanceUploadEntry;
    }) => Promise<T>): Promise<T> {
      options.assertCurrent();
      return store.exclusive(key, async () => {
        let active = true;
        const guard = () => { options.assertCurrent(); if (!active) throw new Error("dance_upload_handle_closed"); };
        const read = () => { guard(); const raw = store.read(key); guard(); return raw === null ? null : decodeDanceUploadEntry(raw, scope, sessionId); };
        const required = () => { const entry = read(); if (!entry) throw corrupt(); return entry; };
        const save = (before: DanceUploadEntry | null, next: DanceUploadEntry) => {
          guard(); if (JSON.stringify(read()) !== JSON.stringify(before)) throw new Error("dance_upload_journal_changed");
          const raw = JSON.stringify(next), decoded = decodeDanceUploadEntry(raw, scope, sessionId);
          guard(); store.write(key, raw); guard();
          if (store.read(key) !== raw) throw new Error("dance_upload_storage_unconfirmed");
          return decoded;
        };
        const revise = (entry: DanceUploadEntry, change: Partial<DanceUploadEntry>) => save(entry, { ...entry, ...change, revision: entry.revision + 1 });
        try {
          return await use({
            read,
            initialize(metadata) {
              if (read()) throw new Error("dance_upload_original_required");
              const body: DanceReserveCommand = { version: "dance-moderated-intake-v1", operation: "reserve", idempotency_key: options.commandKey(),
                community_id: scope.communityId, session_id: sessionId, terms_hash: metadata.termsHash,
                content_type: "video/mp4", size_bytes: metadata.byteLength, duration_ms: metadata.durationMs };
              return save(null, { version: 1, revision: 0, recordingJson: JSON.stringify(metadata), reserveJson: JSON.stringify(body),
                reserveReceiptId: null, uploadId: null, putState: "not_started", finalizeJson: null, finalizeReceiptId: null });
            },
            acknowledgeReserve(receipt) {
              const entry = required(), metadata = decodeDanceRecordingMetadata(entry.recordingJson, scope.accountId);
              matchDanceUploadSession(metadata, receipt.session, entry.uploadId);
              if (receipt.operation !== "reserve" || receipt.session.upload_id === null
                || (entry.reserveReceiptId !== null && entry.reserveReceiptId !== receipt.receipt_id)) throw new Error("dance_upload_receipt_mismatch");
              return revise(entry, { reserveReceiptId: receipt.receipt_id, uploadId: receipt.session.upload_id });
            },
            beginPut() {
              const entry = required();
              if (entry.uploadId === null || entry.finalizeJson !== null || !["not_started", "unknown"].includes(entry.putState)) throw new Error("dance_upload_original_required");
              return revise(entry, { putState: "unknown" });
            },
            acknowledgePut(state) {
              const entry = required(); if (entry.putState !== "unknown" || entry.finalizeJson !== null) throw new Error("dance_upload_original_required");
              return revise(entry, { putState: state });
            },
            prepareFinalize() {
              const entry = required(); if (entry.finalizeJson !== null) return entry;
              if (entry.uploadId === null || !["stored", "already_present"].includes(entry.putState)) throw new Error("dance_upload_transfer_unconfirmed");
              const metadata = decodeDanceRecordingMetadata(entry.recordingJson, scope.accountId);
              const body: DanceFinalizeCommand = { version: "dance-moderated-intake-v1", operation: "finalize", idempotency_key: options.commandKey(),
                community_id: scope.communityId, session_id: sessionId, terms_hash: metadata.termsHash, upload_id: entry.uploadId };
              return revise(entry, { finalizeJson: JSON.stringify(body) });
            },
            acknowledgeFinalize(receipt) {
              const entry = required(), body = danceFinalizeBody(entry);
              matchDanceUploadSession(decodeDanceRecordingMetadata(entry.recordingJson, scope.accountId), receipt.session, entry.uploadId);
              if (!body || receipt.operation !== "finalize" || (entry.finalizeReceiptId !== null && entry.finalizeReceiptId !== receipt.receipt_id)) throw new Error("dance_upload_receipt_mismatch");
              return revise(entry, { finalizeReceiptId: receipt.receipt_id });
            },
          });
        } finally { active = false; }
      });
    },
  };
}
