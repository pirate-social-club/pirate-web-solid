import {
  decodeJournalRecord, journalHash, journalIdentifier, journalInteger, journalLiteral, parseJournalJson,
  type JournalFields, type JournalRule,
} from "../../api/contribution-command-codec.ts";
import { captureSessionAuthority, isCurrentSessionAuthority } from "../../api/browser-session-events.ts";
import type { DanceCaptureContext, DanceConsentCommand, DanceCreateCommand, DancePreparationScope, DanceSession, createDancePreparationApi } from "./dance-preparation-api.ts";

export interface DanceJournalScope extends DancePreparationScope {
  readonly personaId: string;
  readonly choreographyId: string;
  readonly choreographyRevision: number;
}
export interface DanceJournalStore {
  read(key: string): string | null;
  write(key: string, raw: string): void;
  remove(key: string): void;
  exclusive<T>(key: string, operation: () => Promise<T>): Promise<T>;
}
export interface DancePreparationEntry extends DanceJournalScope {
  readonly version: 1;
  readonly revision: number;
  readonly createBodyJson: string | null;
  readonly sessionId: string | null;
  readonly termsHash: string | null;
  readonly policyHash: string | null;
  readonly createReceiptId: string | null;
  readonly consentBodyJson: string | null;
  readonly consentReceiptId: string | null;
}
type Api = ReturnType<typeof createDancePreparationApi>;
type CreateReceipt = Awaited<ReturnType<Api["create"]>>;
type ConsentReceipt = Awaited<ReturnType<Api["consent"]>>;
const corrupt = () => new Error("dance_preparation_journal_corrupt");
const nullable = (rule: JournalRule<string>): JournalRule<string | null> => (value): value is string | null => value === null || rule(value);
const text: JournalRule<string> = (value): value is string => typeof value === "string";
const positive: JournalRule<number> = (value): value is number => journalInteger(value) && value > 0;
const common = { version: journalLiteral("dance-moderated-intake-v1"), idempotency_key: journalIdentifier, community_id: journalIdentifier };
const createFields = { ...common, operation: journalLiteral("create"), song_post_id: journalIdentifier, persona_id: journalIdentifier, choreography_id: journalIdentifier, choreography_revision: positive, expected_policy_hash: journalHash } satisfies JournalFields<DanceCreateCommand>;
const consentFields = { ...common, operation: journalLiteral("consent"), session_id: journalIdentifier, terms_hash: journalHash, consent_version: journalIdentifier, consent_hash: journalHash, retention_hash: journalHash } satisfies JournalFields<DanceConsentCommand>;
const fields = {
  version: journalLiteral(1), revision: journalInteger, accountId: journalIdentifier, communityId: journalIdentifier,
  postId: journalIdentifier, personaId: journalIdentifier, choreographyId: journalIdentifier, choreographyRevision: positive,
  createBodyJson: nullable(text), sessionId: nullable(journalIdentifier), termsHash: nullable(journalHash), policyHash: nullable(journalHash),
  createReceiptId: nullable(journalIdentifier), consentBodyJson: nullable(text), consentReceiptId: nullable(journalIdentifier),
} satisfies JournalFields<DancePreparationEntry>;
const decode = <T extends object>(raw: string, rules: JournalFields<T>): T => {
  try { return decodeJournalRecord(parseJournalJson(raw), rules); } catch { throw corrupt(); }
};
export const danceJournalKey = (scope: DanceJournalScope) => `pirate:dance-preparation:v1:${JSON.stringify([scope.accountId, scope.communityId, scope.postId, scope.personaId, scope.choreographyId, scope.choreographyRevision])}`;
export const danceCreateBody = (entry: DancePreparationEntry) => entry.createBodyJson === null ? null : decode<DanceCreateCommand>(entry.createBodyJson, createFields);
export const danceConsentBody = (entry: DancePreparationEntry) => entry.consentBodyJson === null ? null : decode<DanceConsentCommand>(entry.consentBodyJson, consentFields);

export function decodeDancePreparationEntry(raw: string, scope: DanceJournalScope): DancePreparationEntry {
  const entry = decode<DancePreparationEntry>(raw, fields), create = danceCreateBody(entry), consent = danceConsentBody(entry);
  if (danceJournalKey(entry) !== danceJournalKey(scope)) throw corrupt();
  if (create && (create.community_id !== scope.communityId || create.song_post_id !== scope.postId || create.persona_id !== scope.personaId || create.choreography_id !== scope.choreographyId || create.choreography_revision !== scope.choreographyRevision)) throw corrupt();
  if (entry.sessionId === null) {
    if (!create || entry.termsHash !== null || entry.policyHash !== null || entry.createReceiptId !== null || consent !== null) throw corrupt();
  } else if (entry.termsHash === null || entry.policyHash === null || (create && (create.expected_policy_hash !== entry.policyHash || entry.createReceiptId === null))) throw corrupt();
  if ((entry.createReceiptId !== null && create === null) || (entry.consentReceiptId !== null && consent === null)) throw corrupt();
  if (consent && (consent.community_id !== scope.communityId || consent.session_id !== entry.sessionId || consent.terms_hash !== entry.termsHash)) throw corrupt();
  return entry;
}

/** Command metadata only. No media bytes, signed URLs, credentials or context
 * replacement. Unknown writes remain recoverable under their original keys. */
export function createDancePreparationJournal(options: {
  readonly scope: DanceJournalScope;
  readonly currentScope: () => DanceJournalScope | null;
  readonly store: DanceJournalStore;
}) {
  const scope = Object.freeze({ ...options.scope }), key = danceJournalKey(scope), store = options.store;
  const authority = captureSessionAuthority();
  const current = () => {
    const selected = options.currentScope();
    if (!isCurrentSessionAuthority(authority) || !selected || danceJournalKey(selected) !== key) throw new Error("dance_preparation_scope_changed");
  };
  const read = () => { current(); const raw = store.read(key); current(); return raw === null ? null : decodeDancePreparationEntry(raw, scope); };
  const matches = (entry: DancePreparationEntry, session: DanceSession) => {
    if (session.community_id !== scope.communityId || session.song_post_id !== scope.postId || session.choreography_id !== scope.choreographyId || session.choreography_revision !== scope.choreographyRevision
      || session.session_id !== entry.sessionId || session.terms_hash !== entry.termsHash || session.policy_hash !== entry.policyHash) throw new Error("dance_preparation_receipt_mismatch");
  };
  return {
    read,
    async exclusive<T>(use: (handle: {
      read(): DancePreparationEntry | null;
      initialize(body: DanceCreateCommand): DancePreparationEntry;
      adopt(context: DanceCaptureContext): DancePreparationEntry;
      acknowledgeCreate(receipt: CreateReceipt): DancePreparationEntry;
      prepareConsent(body: DanceConsentCommand): DancePreparationEntry;
      acknowledgeConsent(receipt: ConsentReceipt): DancePreparationEntry;
      claimCapture(expected: DancePreparationEntry): DancePreparationEntry;
      closeTerminal(session: DanceSession): void;
    }) => Promise<T>): Promise<T> {
      current();
      return store.exclusive(key, async () => {
        let active = true;
        const live = () => { current(); if (!active) throw new Error("dance_preparation_journal_handle_closed"); };
        const load = () => { live(); return read(); };
        const required = () => { const entry = load(); if (!entry) throw corrupt(); return entry; };
        const save = (before: DancePreparationEntry | null, next: DancePreparationEntry) => {
          live(); const previous = store.read(key);
          if ((previous === null) !== (before === null) || (previous !== null && JSON.stringify(decodeDancePreparationEntry(previous, scope)) !== JSON.stringify(before))) throw new Error("dance_preparation_journal_changed");
          const raw = JSON.stringify(next); decodeDancePreparationEntry(raw, scope); current(); store.write(key, raw); current();
          if (store.read(key) !== raw) throw new Error("dance_preparation_journal_unavailable");
          return decodeDancePreparationEntry(raw, scope);
        };
        const empty = (): DancePreparationEntry => ({ ...scope, version: 1, revision: 0, createBodyJson: null, sessionId: null, termsHash: null, policyHash: null, createReceiptId: null, consentBodyJson: null, consentReceiptId: null });
        const revise = (entry: DancePreparationEntry, change: Partial<DancePreparationEntry>) => save(entry, { ...entry, ...change, revision: entry.revision + 1 });
        try {
          return await use({
            read: load,
            initialize(body) {
              if (load()) throw new Error("dance_preparation_original_required");
              return save(null, { ...empty(), createBodyJson: JSON.stringify(body) });
            },
            adopt(context) {
              if (load()) throw new Error("dance_preparation_original_required");
              const entry = { ...empty(), sessionId: context.session.session_id, termsHash: context.session.terms_hash, policyHash: context.session.policy_hash };
              matches(entry, context.session);
              if (context.persona_id !== scope.personaId) throw new Error("dance_preparation_receipt_mismatch");
              return save(null, entry);
            },
            acknowledgeCreate(receipt) {
              const entry = required(), create = danceCreateBody(entry), session = receipt.session;
              if (!create || receipt.version !== "dance-moderated-intake-receipt-v1" || receipt.operation !== "create" || (entry.createReceiptId !== null && entry.createReceiptId !== receipt.receipt_id)) throw new Error("dance_preparation_receipt_mismatch");
              const bound = { ...entry, sessionId: entry.sessionId ?? session.session_id, termsHash: entry.termsHash ?? session.terms_hash, policyHash: entry.policyHash ?? create.expected_policy_hash };
              matches(bound, session);
              return revise(entry, { sessionId: bound.sessionId, termsHash: bound.termsHash, policyHash: bound.policyHash, createReceiptId: receipt.receipt_id });
            },
            prepareConsent(body) {
              const entry = required();
              if (entry.consentBodyJson !== null) throw new Error("dance_preparation_original_required");
              return revise(entry, { consentBodyJson: JSON.stringify(body) });
            },
            acknowledgeConsent(receipt) {
              const entry = required(), consent = danceConsentBody(entry);
              if (!consent || receipt.version !== "dance-moderated-intake-receipt-v1" || receipt.operation !== "consent" || (entry.consentReceiptId !== null && entry.consentReceiptId !== receipt.receipt_id)) throw new Error("dance_preparation_receipt_mismatch");
              matches(entry, receipt.session);
              if (receipt.session.consent_version !== consent.consent_version || receipt.session.consent_hash !== consent.consent_hash || receipt.session.retention_hash !== consent.retention_hash) throw new Error("dance_preparation_receipt_mismatch");
              return revise(entry, { consentReceiptId: receipt.receipt_id });
            },
            claimCapture(expected) {
              const entry = required();
              if (entry.consentReceiptId === null || JSON.stringify(entry) !== JSON.stringify(expected)) throw new Error("dance_preparation_capture_superseded");
              // A local cross-tab fence, not a server upload reservation.
              return revise(entry, {});
            },
            closeTerminal(session) {
              const entry = required(); matches(entry, session);
              if (session.state !== "terminal") throw new Error("dance_preparation_resolution_unproven");
              live(); store.remove(key); current();
              if (store.read(key) !== null) throw new Error("dance_preparation_journal_unavailable");
            },
          });
        } finally { active = false; }
      });
    },
  };
}

export function createBrowserDanceJournalStore(): DanceJournalStore {
  if (!("window" in globalThis) || !("navigator" in globalThis) || !navigator.locks) throw new Error("dance_preparation_journal_unavailable");
  const storage = window.localStorage, locks = navigator.locks;
  return { read: key => storage.getItem(key), write: (key, raw) => storage.setItem(key, raw), remove: key => storage.removeItem(key),
    async exclusive<T>(key: string, operation: () => Promise<T>): Promise<T> { return await locks.request(key, { mode: "exclusive" }, operation); } };
}
