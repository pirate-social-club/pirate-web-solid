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
  state: "submitted" | "pending_confirmation" | "completed" | "not_started";
}
export interface GuestAuthorityJournal {
  pointer: GuestAuthoritySelection | null;
  issuance: { key: string; ownerId: string | null; credentialId: string | null } | null;
  starts: OriginalGuestStart[];
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
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const nullableText = (value: unknown): value is string | null => value === null || text(value);
function body(value: unknown): value is GuestStartBody {
  if (!object(value) || Object.keys(value).length !== 8 || !object(value.disclosure)) return false;
  return text(value.idempotency_key) && text(value.expected_owner_id) && nullableText(value.target_language)
    && (value.learner_band === null || value.learner_band === "A1" || value.learner_band === "A2"
      || value.learner_band === "B1" || value.learner_band === "B2" || value.learner_band === "C1" || value.learner_band === "C2")
    && text(value.timezone) && value.reward_mode === "practice_only" && value.reward_preview_terms_hash === null
    && Object.keys(value.disclosure).length === 2 && text(value.disclosure.version) && value.disclosure.accepted === true;
}
function journal(value: unknown, origin: string): value is GuestAuthorityJournal {
  if (!object(value) || Object.keys(value).length !== 3 || !Array.isArray(value.starts)) return false;
  const p = value.pointer;
  if (p !== null && (!object(p) || Object.keys(p).length !== 4 || p.origin !== origin
    || !text(p.owner_id) || !text(p.credential_id) || !nullableText(p.last_start_key))) return false;
  const i = value.issuance;
  if (i !== null && (!object(i) || Object.keys(i).length !== 3 || !text(i.key)
    || !nullableText(i.ownerId) || !nullableText(i.credentialId)
    || ((i.ownerId === null) !== (i.credentialId === null)))) return false;
  return value.starts.every((s: unknown) => object(s) && Object.keys(s).length === 4
    && text(s.communityId) && text(s.postId) && body(s.body)
    && (s.state === "submitted" || s.state === "pending_confirmation" || s.state === "completed" || s.state === "not_started"));
}
/** One origin-scoped journal keeps pointer + immutable request commits in one transaction. */
export function createIndexedDbGuestAuthorityStore(origin: string, factory: IDBFactory = indexedDB): GuestAuthorityStore {
  let connection: Promise<IDBDatabase> | undefined;
  const open = () => connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open("pirate.guest-authority.v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("journal");
    request.onerror = () => reject(new GuestSelectionStorageError());
    request.onblocked = () => reject(new GuestSelectionStorageError());
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); connection = undefined; };
      resolve(request.result);
    };
  });
  async function transact(mutate?: (state: GuestAuthorityJournal) => void): Promise<GuestAuthorityJournal> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("journal", mutate === undefined ? "readonly" : "readwrite");
      const store = tx.objectStore("journal");
      let state = emptyGuestJournal();
      tx.oncomplete = () => resolve(state);
      tx.onabort = tx.onerror = () => reject(new GuestSelectionStorageError());
      const request = store.get(origin);
      request.onerror = () => tx.abort();
      request.onsuccess = () => {
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
        } catch { tx.abort(); }
      };
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
