import { captureSessionAuthority, isCurrentSessionAuthority } from "../../api/browser-session-events";
import { decodeJournalRecord, journalHash, journalIdentifier, journalInteger, journalLiteral, parseJournalJson, type JournalFields, type JournalRule } from "../../api/contribution-command-codec";
import type { DanceRecordedTake } from "./dance-capture";
import type { DancePreparationView } from "./dance-preparation-controller";
import { createDancePreparationJournal, danceConsentBody, danceJournalKey, type DanceJournalScope, type DanceJournalStore, type DancePreparationEntry } from "./dance-preparation-journal";

export interface DanceRecordingMetadata extends DanceJournalScope {
  readonly version: 1;
  readonly sessionId: string;
  readonly termsHash: string;
  readonly policyHash: string;
  readonly consentVersion: string;
  readonly consentHash: string;
  readonly retentionHash: string;
  readonly consentReceiptId: string;
  readonly durationMs: number;
  readonly byteLength: number;
  readonly sha256: string;
  readonly storedAtMs: number;
  readonly expiresAtMs: number;
}
export interface StoredDanceRecording { readonly metadataJson: string; readonly blob: Blob }
export interface DanceRecordingStorage {
  exclusive<T>(sessionId: string, use: () => Promise<T>): Promise<T>;
  load(sessionId: string, guard: () => void): Promise<StoredDanceRecording | null>;
  add(record: StoredDanceRecording, guard: () => void): Promise<void>;
  remove(sessionId: string, guard: () => void): Promise<void>;
  pruneExpired(nowMs: number, guard: () => void): Promise<void>;
}
const positive: JournalRule<number> = (value): value is number => journalInteger(value) && value > 0;
const fields = {
  version: journalLiteral(1), accountId: journalIdentifier, communityId: journalIdentifier, postId: journalIdentifier,
  personaId: journalIdentifier, choreographyId: journalIdentifier, choreographyRevision: positive,
  sessionId: journalIdentifier, termsHash: journalHash, policyHash: journalHash, consentVersion: journalIdentifier,
  consentHash: journalHash, retentionHash: journalHash, consentReceiptId: journalIdentifier,
  durationMs: positive, byteLength: positive, sha256: journalHash, storedAtMs: journalInteger, expiresAtMs: positive,
} satisfies JournalFields<DanceRecordingMetadata>;

export function decodeDanceRecordingMetadata(raw: string, accountId: string): DanceRecordingMetadata {
  try {
    const metadata = decodeJournalRecord<DanceRecordingMetadata>(parseJournalJson(raw), fields);
    if (metadata.accountId !== accountId || metadata.expiresAtMs <= metadata.storedAtMs) throw new Error();
    return metadata;
  } catch { throw new Error("dance_recording_corrupt"); }
}
export function decodeStoredDanceRecording(value: unknown, accountId: string): StoredDanceRecording {
  if (typeof value !== "object" || value === null || Object.keys(value).length !== 2
    || !("metadataJson" in value) || typeof value.metadataJson !== "string"
    || !("blob" in value) || !(value.blob instanceof Blob)) throw new Error("dance_recording_corrupt");
  const metadata = decodeDanceRecordingMetadata(value.metadataJson, accountId);
  if (value.blob.size !== metadata.byteLength || value.blob.type !== "video/mp4") throw new Error("dance_recording_corrupt");
  return { metadataJson: value.metadataJson, blob: value.blob };
}
export async function danceRecordingDigest(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Keeps the bounded original before any upload reservation. Storage never
 * grants authentication or server acceptance. Lost writes are read back under
 * the same session; a different take cannot overwrite the original. */
export function createDanceRecordingController(options: {
  readonly scope: DanceJournalScope;
  readonly currentScope: () => DanceJournalScope | null;
  readonly preparationStore: DanceJournalStore;
  readonly storage: DanceRecordingStorage;
  readonly nowMs?: () => number;
}) {
  const scope = Object.freeze({ ...options.scope }), key = danceJournalKey(scope);
  const authority = captureSessionAuthority(), storage = options.storage, now = options.nowMs ?? Date.now;
  const journal = createDancePreparationJournal({ scope, currentScope: options.currentScope, store: options.preparationStore });
  const current = (signal: AbortSignal) => {
    signal.throwIfAborted(); const selected = options.currentScope();
    if (!isCurrentSessionAuthority(authority) || !selected || danceJournalKey(selected) !== key) throw new Error("dance_recording_scope_changed");
  };
  const time = () => { const value = now(); if (!Number.isSafeInteger(value) || value < 0) throw new Error("dance_recording_clock_unavailable"); return value; };
  const matches = (metadata: DanceRecordingMetadata, entry: DancePreparationEntry | null) => {
    const consent = entry && danceConsentBody(entry);
    if (!entry || !consent || danceJournalKey(metadata) !== key || metadata.sessionId !== entry.sessionId
      || metadata.termsHash !== entry.termsHash || metadata.policyHash !== entry.policyHash
      || metadata.consentReceiptId !== entry.consentReceiptId || metadata.consentVersion !== consent.consent_version
      || metadata.consentHash !== consent.consent_hash || metadata.retentionHash !== consent.retention_hash) throw new Error("dance_recording_target_changed");
  };
  const verify = async (record: StoredDanceRecording, sessionId: string, guard: () => void) => {
    guard(); record = decodeStoredDanceRecording(record, scope.accountId);
    const metadata = decodeDanceRecordingMetadata(record.metadataJson, scope.accountId);
    if (metadata.sessionId !== sessionId || danceJournalKey(metadata) !== key) throw new Error("dance_recording_target_changed");
    const digest = await danceRecordingDigest(record.blob); guard();
    if (digest !== metadata.sha256) throw new Error("dance_recording_corrupt");
    return { metadata, blob: record.blob };
  };
  return {
    async cleanupExpired(signal: AbortSignal): Promise<void> {
      const guard = () => current(signal); guard();
      await storage.pruneExpired(time(), guard); guard();
    },
    async retain(ready: Extract<DancePreparationView, { kind: "capture_ready" }>, take: DanceRecordedTake, signal: AbortSignal) {
      take = { ...take };
      const session = { ...ready.session }, file = take.file;
      const guard = () => { current(signal); ready.assertCurrent(); if (time() >= session.expires_at_ms) throw new Error("dance_recording_expired"); };
      guard();
      if (session.state !== "consented" || take.sessionId !== session.session_id || take.termsHash !== session.terms_hash
        || ready.context.persona_id !== scope.personaId || session.community_id !== scope.communityId || session.song_post_id !== scope.postId
        || session.choreography_id !== scope.choreographyId || session.choreography_revision !== scope.choreographyRevision
        || take.durationMs !== session.body_end_ms || file.type !== "video/mp4" || file.size === 0 || file.size > session.maximum_bytes) throw new Error("dance_recording_target_changed");
      await storage.pruneExpired(time(), guard); guard();
      const sha256 = await danceRecordingDigest(file); guard();
      return storage.exclusive(session.session_id, () => journal.exclusive(async handle => {
        guard(); const entry = handle.read(), consent = entry && danceConsentBody(entry);
        if (!entry?.consentReceiptId || !consent) throw new Error("dance_recording_consent_unconfirmed");
        const metadata: DanceRecordingMetadata = { ...scope, version: 1, sessionId: session.session_id,
          termsHash: session.terms_hash, policyHash: session.policy_hash, consentVersion: session.consent_version,
          consentHash: session.consent_hash, retentionHash: session.retention_hash, consentReceiptId: entry.consentReceiptId,
          durationMs: take.durationMs, byteLength: file.size, sha256, storedAtMs: time(), expiresAtMs: session.expires_at_ms };
        matches(metadata, entry);
        let retained = await storage.load(session.session_id, guard); guard();
        if (retained === null) {
          retained = { metadataJson: JSON.stringify(metadata), blob: file };
          decodeStoredDanceRecording(retained, scope.accountId);
          await storage.add(retained, guard); guard();
          retained = await storage.load(session.session_id, guard); guard();
          if (!retained) throw new Error("dance_recording_storage_unconfirmed");
        }
        const original = await verify(retained, session.session_id, guard);
        matches(original.metadata, entry);
        if (original.metadata.sha256 !== sha256 || original.metadata.byteLength !== file.size
          || original.metadata.durationMs !== take.durationMs || original.metadata.expiresAtMs !== session.expires_at_ms) throw new Error("dance_recording_original_required");
        return original;
      }));
    },
    async restore(sessionId: string, signal: AbortSignal) {
      const guard = () => current(signal); guard();
      // Expiry is the original pre-submit session bound, never a reload-based
      // extension. A closed browser cannot execute cleanup; prune on return.
      await storage.pruneExpired(time(), guard); guard();
      return storage.exclusive(sessionId, () => journal.exclusive(async handle => {
        guard(); const retained = await storage.load(sessionId, guard); guard();
        if (!retained) return null;
        const original = await verify(retained, sessionId, guard);
        if (time() >= original.metadata.expiresAtMs) { await storage.remove(sessionId, guard); guard(); return null; }
        matches(original.metadata, handle.read());
        return original;
      }));
    },
    /** Removes only this local copy; never represents withdrawal or deletion
     * of a server recording. Call after a confirmed handoff or explicit discard. */
    async removeLocal(sessionId: string, signal: AbortSignal) {
      const guard = () => current(signal); guard();
      await storage.exclusive(sessionId, async () => {
        const record = await storage.load(sessionId, guard); guard();
        if (!record) return;
        const metadata = decodeDanceRecordingMetadata(record.metadataJson, scope.accountId);
        if (metadata.sessionId !== sessionId || danceJournalKey(metadata) !== key) throw new Error("dance_recording_target_changed");
        await storage.remove(sessionId, guard); guard();
      });
    },
  };
}
