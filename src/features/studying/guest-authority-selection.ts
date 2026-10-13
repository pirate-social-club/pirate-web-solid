import type { OriginalGuestAttachment } from "./guest-study-attachment-coordinator";
import { isGuestRewardTerms, canonicalGuestInstant, type GuestRewardTerms } from "./guest-study-reward-model";
import type { GuestStudyApi } from "./guest-study-api.ts";

export type GuestStartBody = Parameters<GuestStudyApi["startSession"]>[0]["body"];
/** Locators only. This pointer never authenticates a request. */
export interface GuestAuthoritySelection {
  origin: string;
  owner_id: string;
  credential_id: string;
  last_start_key: string | null;
}
export interface OriginalGuestStart {
  communityId: string;
  postId: string;
  body: GuestStartBody;
  /** Immutable full accepted terms, alongside the server-issued request hash in body. */
  acceptedRewardTerms?: GuestRewardTerms;
  state: "submitted" | "pending_confirmation" | "completed" | "not_started";
}
export interface GuestAuthorityJournal {
  pointer: GuestAuthoritySelection | null;
  issuance: { key: string; ownerId: string | null; credentialId: string | null } | null;
  starts: OriginalGuestStart[];
  /** Nonsecret initiating-origin ceremony; absent in prior journals. Never a proof. */
  attachment?: OriginalGuestAttachment;
}
export interface GuestAuthorityStore {
  read(): Promise<GuestAuthorityJournal>;
  /** Synchronous mutation committed atomically before this promise resolves. No IO in mutate. */
  update(mutate: (journal: GuestAuthorityJournal) => void): Promise<void>;
}
export class GuestSelectionStorageError extends Error {
  constructor() { super("Guest recovery storage is unavailable or damaged."); }
}
export const emptyGuestJournal = (): GuestAuthorityJournal => ({ pointer: null, issuance: null, starts: [] });
const object = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const nullableText = (value: unknown): value is string | null => value === null || text(value);
function body(value: unknown): value is GuestStartBody {
  if (!object(value) || Object.keys(value).length !== 8
    || !("idempotency_key" in value) || !("expected_owner_id" in value)
    || !("target_language" in value) || !("learner_band" in value) || !("timezone" in value)
    || !("reward_mode" in value) || !("reward_preview_terms_hash" in value)
    || !("disclosure" in value) || !object(value.disclosure)
    || !("version" in value.disclosure) || !("accepted" in value.disclosure)) return false;
  return text(value.idempotency_key) && text(value.expected_owner_id) && nullableText(value.target_language)
    && (value.learner_band === null || value.learner_band === "A1" || value.learner_band === "A2"
      || value.learner_band === "B1" || value.learner_band === "B2" || value.learner_band === "C1" || value.learner_band === "C2")
    && text(value.timezone) && ((value.reward_mode === "practice_only" && value.reward_preview_terms_hash === null)
      || (value.reward_mode === "megapot_guest_v1" && typeof value.reward_preview_terms_hash === "string" && /^[a-f0-9]{64}$/u.test(value.reward_preview_terms_hash)))
    && Object.keys(value.disclosure).length === 2 && text(value.disclosure.version) && value.disclosure.accepted === true;
}
function attachment(value: unknown, origin: string): value is OriginalGuestAttachment {
  if (!object(value) || Object.keys(value).length !== 8 || !("origin" in value) || value.origin !== origin
    || !("ownerId" in value) || !("credentialId" in value) || !("key" in value) || !("intent" in value)
    || !("target" in value) || !("confirmationSubmitted" in value) || !("binding" in value)
    || !text(value.ownerId) || !text(value.credentialId) || !text(value.key) || typeof value.confirmationSubmitted !== "boolean") return false;
  const intent = value.intent, target = value.target, binding = value.binding;
  if (intent !== null && (!object(intent) || Object.keys(intent).length !== 3
    || !("intent_id" in intent) || !("expires_at" in intent) || !("state" in intent)
    || !text(intent.intent_id) || !canonicalGuestInstant(intent.expires_at) || intent.state !== "awaiting_account")) return false;
  if (target !== null && (!object(target) || Object.keys(target).length !== 4
    || !("intent_id" in target) || !("target_revision" in target) || !("account_confirmation" in target) || !("state" in target)
    || intent === null || target.intent_id !== intent.intent_id || target.state !== "awaiting_confirmation"
    || typeof target.target_revision !== "number" || !Number.isSafeInteger(target.target_revision) || target.target_revision < 1
    || !object(target.account_confirmation) || Object.keys(target.account_confirmation).length !== 2
    || !("account_id" in target.account_confirmation) || !("display_name" in target.account_confirmation)
    || !text(target.account_confirmation.account_id) || !nullableText(target.account_confirmation.display_name))) return false;
  if (value.confirmationSubmitted && target === null) return false;
  if (binding !== null && (!object(binding) || Object.keys(binding).length !== 5 || !("attachment_id" in binding)
    || !("owner_id" in binding) || !("account_id" in binding) || !("state" in binding) || !("bound_at" in binding)
    || (intent === null || binding.attachment_id !== intent.intent_id) || binding.owner_id !== value.ownerId || !text(binding.account_id)
    || binding.state !== "bound" || !canonicalGuestInstant(binding.bound_at) || !value.confirmationSubmitted || target === null
    || !object(target.account_confirmation)
    || binding.account_id !== target.account_confirmation.account_id)) return false;
  return true;
}
function journal(value: unknown, origin: string): value is GuestAuthorityJournal {
  if (!object(value) || (Object.keys(value).length !== 3 && Object.keys(value).length !== 4)
    || (Object.keys(value).length === 4 && !("attachment" in value))
    || ("attachment" in value && !attachment(value.attachment, origin))
    || !("starts" in value) || !("pointer" in value) || !("issuance" in value)
    || !Array.isArray(value.starts)) return false;
  const p = value.pointer;
  if (p !== null && (!object(p) || Object.keys(p).length !== 4
    || !("origin" in p) || !("owner_id" in p) || !("credential_id" in p) || !("last_start_key" in p)
    || p.origin !== origin
    || !text(p.owner_id) || !text(p.credential_id) || !nullableText(p.last_start_key))) return false;
  const i = value.issuance;
  if (i !== null && (!object(i) || Object.keys(i).length !== 3
    || !("key" in i) || !("ownerId" in i) || !("credentialId" in i) || !text(i.key)
    || !nullableText(i.ownerId) || !nullableText(i.credentialId)
    || ((i.ownerId === null) !== (i.credentialId === null)))) return false;
  return value.starts.every((s: unknown) => object(s) && (Object.keys(s).length === 4 || Object.keys(s).length === 5)
    && "communityId" in s && "postId" in s && "body" in s && "state" in s
    && text(s.communityId) && text(s.postId) && body(s.body)
    && (s.body.reward_mode === "practice_only" ? Object.keys(s).length === 4 && !("acceptedRewardTerms" in s)
      : Object.keys(s).length === 5 && "acceptedRewardTerms" in s && isGuestRewardTerms(s.acceptedRewardTerms)
        && s.acceptedRewardTerms.community_id === s.communityId && s.acceptedRewardTerms.post_id === s.postId
        && s.acceptedRewardTerms.disclosure_version === s.body.disclosure.version)
    && (s.state === "submitted" || s.state === "pending_confirmation" || s.state === "completed" || s.state === "not_started"));
}
/** One origin-scoped journal keeps pointer + immutable request commits in one transaction. */
export function createIndexedDbGuestAuthorityStore(
  origin: string, factory: IDBFactory = indexedDB, options: { timeoutMs?: number } = {},
): GuestAuthorityStore {
  const timeout = options.timeoutMs ?? 5_000;
  if (!Number.isFinite(timeout) || timeout < 1 || timeout > 30_000) throw new GuestSelectionStorageError();
  let connection: Promise<IDBDatabase> | undefined;
  const open = () => {
    if (connection !== undefined) return connection;
    const attempt = new Promise<IDBDatabase>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(fail, timeout);
      function fail() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new GuestSelectionStorageError());
      }
      let request: IDBOpenDBRequest;
      try { request = factory.open("pirate.guest-authority.v1", 1); }
      catch { fail(); return; }
      request.onupgradeneeded = () => {
        if (settled) {
          try { request.transaction?.abort(); } catch { /* Open already settled. */ }
          return;
        }
        try { request.result.createObjectStore("journal"); }
        catch {
          try { request.transaction?.abort(); } catch { /* Upgrade already inactive. */ }
          fail();
        }
      };
      request.onerror = request.onblocked = fail;
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        settled = true;
        clearTimeout(timer);
        db.onversionchange = () => { db.close(); if (connection === attempt) connection = undefined; };
        resolve(db);
      };
    });
    connection = attempt;
    // Failed opens may be retried, but every late successful handle is still closed by its owner.
    void attempt.catch(() => { if (connection === attempt) connection = undefined; });
    return attempt;
  };
  async function transact(mutate?: (state: GuestAuthorityJournal) => void): Promise<GuestAuthorityJournal> {
    const attempt = open();
    const db = await attempt;
    return new Promise((resolve, reject) => {
      let tx: IDBTransaction;
      try { tx = db.transaction("journal", mutate === undefined ? "readonly" : "readwrite"); }
      catch { reject(new GuestSelectionStorageError()); return; }
      let settled = false;
      let state = emptyGuestJournal();
      const timer = setTimeout(() => {
        fail();
        db.close();
        if (connection === attempt) connection = undefined;
      }, timeout);
      function fail() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Abort can throw if commit was already decided. That remains storage uncertainty,
        // never authority absence and never permission to POST or replace an original key.
        try { tx.abort(); } catch { /* Already inactive; await no new work on this transaction. */ }
        reject(new GuestSelectionStorageError());
      }
      tx.oncomplete = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(state);
      };
      tx.onabort = tx.onerror = fail;
      try {
        const store = tx.objectStore("journal");
        const request = store.get(origin);
        request.onerror = fail;
        request.onsuccess = () => {
          if (settled) return;
          try {
            const value: unknown = request.result;
            if (value !== undefined) {
              if (!journal(value, origin)) throw new GuestSelectionStorageError();
              state = value;
            }
            if (mutate !== undefined) {
              mutate(state);
              if (!journal(state, origin)) throw new GuestSelectionStorageError();
              store.put(state, origin);
            }
          } catch { fail(); }
        };
      } catch { fail(); }
    });
  }
  return { read: () => transact(), update: async (mutate) => { await transact(mutate); } };
}
/** No reload or multi-tab coordination claim. Never writes the durable journal. */
export function createPageGuestAuthorityStore(): GuestAuthorityStore {
  let state = emptyGuestJournal();
  return {
    read: async () => structuredClone(state),
    update: async (mutate) => { const next = structuredClone(state); mutate(next); state = next; },
  };
}
