export interface GuestStudyAnswerScope {
  readonly origin: string;
  readonly ownerId: string;
  readonly communityId: string;
  readonly sessionId: string;
}
export interface GuestStudyAnswerMarker extends GuestStudyAnswerScope {
  readonly sessionItemId: string;
  readonly attemptNumber: number;
  readonly idempotencyKey: string;
}
export interface GuestStudyAnswerInventory {
  readonly scope: GuestStudyAnswerScope;
  readonly pending: GuestStudyAnswerMarker | null;
}
export class GuestStudyAnswerJournalError extends Error {
  constructor(readonly reason: "unavailable" | "damaged" | "inventory_missing" | "pending" | "result_mismatch" | "not_original" | "dispatch_uncertain") {
    super("The original Study answer must be preserved until it is confirmed.");
    this.name = "GuestStudyAnswerJournalError";
  }
}
/** Local metadata transactions, not authentication or a server outcome oracle. */
export interface GuestStudyAnswerStorage {
  read(scope: GuestStudyAnswerScope): Promise<GuestStudyAnswerInventory | null>;
  register(scope: GuestStudyAnswerScope): Promise<void>;
  mark(marker: GuestStudyAnswerMarker): Promise<void>;
  clearMatching(marker: GuestStudyAnswerMarker): Promise<void>;
}
const object = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const identifier = (value: unknown): value is string => typeof value === "string"
  && value.length > 0 && value.length <= 128 && !/[\s\x00-\x1f\x7f]/u.test(value);
const exactKeys = (value: object, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every(name => Object.hasOwn(value, name));
export function validGuestAnswerScope(value: unknown): value is GuestStudyAnswerScope {
  if (!object(value) || !("origin" in value) || !("ownerId" in value)
    || !("communityId" in value) || !("sessionId" in value)
    || !exactKeys(value, ["origin", "ownerId", "communityId", "sessionId"]) || typeof value.origin !== "string"
    || !identifier(value.ownerId) || !identifier(value.communityId) || !identifier(value.sessionId)) return false;
  try { const url = new URL(value.origin); return url.origin === value.origin
    && (url.protocol === "https:" || url.protocol === "http:"); } catch { return false; }
}
export function validGuestAnswerMarker(value: unknown): value is GuestStudyAnswerMarker {
  if (!object(value) || !("origin" in value) || !("ownerId" in value)
    || !("communityId" in value) || !("sessionId" in value) || !("sessionItemId" in value)
    || !("attemptNumber" in value) || !("idempotencyKey" in value)
    || !exactKeys(value, ["origin", "ownerId", "communityId", "sessionId", "sessionItemId", "attemptNumber", "idempotencyKey"]) || !identifier(value.sessionItemId)
    || !identifier(value.idempotencyKey) || !Number.isInteger(value.attemptNumber)
    || typeof value.attemptNumber !== "number" || value.attemptNumber < 1 || value.attemptNumber > 3) return false;
  return validGuestAnswerScope({ origin: value.origin, ownerId: value.ownerId,
    communityId: value.communityId, sessionId: value.sessionId });
}
export function sameGuestAnswerScope(a: GuestStudyAnswerScope, b: GuestStudyAnswerScope): boolean {
  return a.origin === b.origin && a.ownerId === b.ownerId && a.communityId === b.communityId && a.sessionId === b.sessionId;
}
export function sameGuestAnswerMarker(a: GuestStudyAnswerMarker, b: GuestStudyAnswerMarker): boolean {
  return sameGuestAnswerScope(a, b) && a.sessionItemId === b.sessionItemId
    && a.attemptNumber === b.attemptNumber && a.idempotencyKey === b.idempotencyKey;
}
export function guestAnswerScopeOf(marker: GuestStudyAnswerMarker): GuestStudyAnswerScope {
  return { origin: marker.origin, ownerId: marker.ownerId, communityId: marker.communityId, sessionId: marker.sessionId };
}
function inventory(value: unknown, scope: GuestStudyAnswerScope): value is GuestStudyAnswerInventory {
  return object(value) && "scope" in value && "pending" in value
    && exactKeys(value, ["scope", "pending"]) && validGuestAnswerScope(value.scope)
    && sameGuestAnswerScope(value.scope, scope) && (value.pending === null
      || (validGuestAnswerMarker(value.pending) && sameGuestAnswerScope(value.pending, scope)));
}
const key = (scope: GuestStudyAnswerScope) => JSON.stringify([scope.origin, scope.ownerId, scope.communityId, scope.sessionId]);
function requireScope(scope: GuestStudyAnswerScope, origin: string) {
  if (!validGuestAnswerScope(scope) || scope.origin !== origin) throw new GuestStudyAnswerJournalError("damaged");
}
const DATABASE = "pirate.guest-study-answers.v1", STORE = "sessionInventory", DEADLINE_MS = 2_000;

/** Independent namespace. Never opens or mutates the authority pointer/start journal. */
export function createIndexedDbGuestStudyAnswerStorage(origin: string, factory?: IDBFactory): GuestStudyAnswerStorage {
  let connection: Promise<IDBDatabase> | undefined;
  const open = (): Promise<IDBDatabase> => connection ??= new Promise((resolve, reject) => {
    const actual = factory ?? (typeof indexedDB === "undefined" ? undefined : indexedDB);
    if (actual === undefined) { reject(new GuestStudyAnswerJournalError("unavailable")); return; }
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(new GuestStudyAnswerJournalError("unavailable")); }, DEADLINE_MS);
    const fail = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new GuestStudyAnswerJournalError("unavailable")); } };
    let request: IDBOpenDBRequest;
    try { request = actual.open(DATABASE, 1); } catch { fail(); return; }
    request.onupgradeneeded = () => {
      if (settled) { request.transaction?.abort(); return; }
      request.result.createObjectStore(STORE);
    };
    request.onerror = request.onblocked = fail;
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true; clearTimeout(timer);
      const db = request.result;
      db.onversionchange = () => { db.close(); connection = undefined; };
      resolve(db);
    };
  });
  async function transact(scope: GuestStudyAnswerScope, mutate?: (current: GuestStudyAnswerInventory | null) => GuestStudyAnswerInventory) {
    requireScope(scope, origin);
    const db = await open();
    return new Promise<GuestStudyAnswerInventory | null>((resolve, reject) => {
      let tx: IDBTransaction;
      try { tx = db.transaction(STORE, mutate === undefined ? "readonly" : "readwrite"); }
      catch { reject(new GuestStudyAnswerJournalError("unavailable")); return; }
      let settled = false, result: GuestStudyAnswerInventory | null = null;
      let failure = new GuestStudyAnswerJournalError("unavailable");
      const fail = () => { if (!settled) { settled = true; clearTimeout(timer); reject(failure); } };
      const timer = setTimeout(() => {
        try { tx.abort(); } catch { /* A possibly completed commit is not absence. */ }
        try { db.close(); } catch { /* Fail closed even if native close reports an error. */ }
        connection = undefined;
        fail();
      }, DEADLINE_MS);
      tx.onabort = tx.onerror = fail;
      tx.oncomplete = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } };
      const store = tx.objectStore(STORE), request = store.get(key(scope));
      request.onerror = () => { try { tx.abort(); } catch { fail(); } };
      request.onsuccess = () => {
        if (settled) return;
        try {
          const value: unknown = request.result;
          if (value !== undefined) {
            if (!inventory(value, scope)) throw new GuestStudyAnswerJournalError("damaged");
            result = value;
          }
          if (mutate !== undefined) {
            result = mutate(result);
            if (!inventory(result, scope)) throw new GuestStudyAnswerJournalError("damaged");
            store.put(result, key(scope));
          }
        } catch (error) {
          failure = error instanceof GuestStudyAnswerJournalError ? error : new GuestStudyAnswerJournalError("damaged");
          try { tx.abort(); } catch { fail(); }
        }
      };
    });
  }
  return {
    read: (scope) => transact(scope),
    register: async (scope) => { await transact(scope, current => current ?? { scope, pending: null }); },
    mark: async (marker) => {
      if (!validGuestAnswerMarker(marker)) throw new GuestStudyAnswerJournalError("damaged");
      await transact(guestAnswerScopeOf(marker), current => {
        if (current === null) throw new GuestStudyAnswerJournalError("inventory_missing");
        if (current.pending !== null) throw new GuestStudyAnswerJournalError("pending");
        return { ...current, pending: marker };
      });
    },
    clearMatching: async (marker) => {
      await transact(guestAnswerScopeOf(marker), current => {
        if (current === null) throw new GuestStudyAnswerJournalError("inventory_missing");
        if (current.pending !== null && !sameGuestAnswerMarker(current.pending, marker)) throw new GuestStudyAnswerJournalError("pending");
        return { ...current, pending: null };
      });
    },
  };
}

/** Explicit practice-only page profile; no durable, reload or cross-tab claim. */
export function createPageGuestStudyAnswerStorage(origin: string): GuestStudyAnswerStorage {
  const entries = new Map<string, GuestStudyAnswerInventory>();
  const read = async (scope: GuestStudyAnswerScope) => { requireScope(scope, origin); return structuredClone(entries.get(key(scope)) ?? null); };
  return {
    read,
    register: async (scope) => { requireScope(scope, origin); if (!entries.has(key(scope))) entries.set(key(scope), { scope: structuredClone(scope), pending: null }); },
    mark: async (marker) => {
      if (!validGuestAnswerMarker(marker)) throw new GuestStudyAnswerJournalError("damaged");
      const scope = guestAnswerScopeOf(marker), entry = await read(scope);
      if (entry === null) throw new GuestStudyAnswerJournalError("inventory_missing");
      if (entry.pending !== null) throw new GuestStudyAnswerJournalError("pending");
      entries.set(key(scope), { scope, pending: structuredClone(marker) });
    },
    clearMatching: async (marker) => {
      const scope = guestAnswerScopeOf(marker), entry = await read(scope);
      if (entry === null) throw new GuestStudyAnswerJournalError("inventory_missing");
      if (entry.pending !== null && !sameGuestAnswerMarker(entry.pending, marker)) throw new GuestStudyAnswerJournalError("pending");
      entries.set(key(scope), { scope, pending: null });
    },
  };
}
