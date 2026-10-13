import { afterEach, describe, expect, it, vi } from "vitest";
import type { GuestAuthority, GuestStudyApi } from "./guest-study-api.ts";
import { createGuestStudyStartCoordinator } from "./guest-study-start-coordinator.ts";
import { createIndexedDbGuestAuthorityStore, GuestSelectionStorageError } from "./guest-authority-selection.ts";

// Controlled DOM event schedule, not a substitute for genuine browser IndexedDB acceptance.
// Unsupported IDL operations throw, rather than inventing fake persistence/commit success.
class Request<T> extends EventTarget implements IDBRequest<T> {
  result: T;
  error = null;
  get source(): IDBRequest<T>["source"] { throw new Error("unused IDL source operation"); }
  transaction: IDBTransaction | null = null;
  readyState: IDBRequestReadyState = "pending";
  onsuccess: IDBRequest<T>["onsuccess"] = null;
  onerror: IDBRequest<T>["onerror"] = null;
  constructor(result: T) { super(); this.result = result; }
  succeed() { this.readyState = "done"; this.onsuccess?.call(this, new Event("success")); }
}
class VersionEvent extends Event implements IDBVersionChangeEvent {
  oldVersion = 1;
  newVersion = 1;
}
class OpenRequest extends Request<IDBDatabase> implements IDBOpenDBRequest {
  onblocked: IDBOpenDBRequest["onblocked"] = null;
  onupgradeneeded: IDBOpenDBRequest["onupgradeneeded"] = null;
  blocked() { this.onblocked?.call(this, new VersionEvent("blocked")); }
}
const names: DOMStringList = { length: 1, contains: (name) => name === "journal", item: (index) => index === 0 ? "journal" : null, [Symbol.iterator]: () => ["journal"].values() };
class Store implements IDBObjectStore {
  name = "journal"; keyPath = null; autoIncrement = false; indexNames = names;
  readonly getRequest = new Request<unknown>(undefined);
  readonly putRequest = new Request<IDBValidKey>("origin");
  putCalls = 0;
  constructor(readonly transaction: Transaction) {}
  get() { return this.getRequest; }
  put() { this.putCalls++; return this.putRequest; }
  add(): never { throw new Error("unused IDL operation"); }
  clear(): never { throw new Error("unused IDL operation"); }
  count(): never { throw new Error("unused IDL operation"); }
  createIndex(): never { throw new Error("unused IDL operation"); }
  delete(): never { throw new Error("unused IDL operation"); }
  deleteIndex(): never { throw new Error("unused IDL operation"); }
  getAll(): never { throw new Error("unused IDL operation"); }
  getAllKeys(): never { throw new Error("unused IDL operation"); }
  getAllRecords(): never { throw new Error("unused IDL operation"); }
  getKey(): never { throw new Error("unused IDL operation"); }
  index(): never { throw new Error("unused IDL operation"); }
  openCursor(): never { throw new Error("unused IDL operation"); }
  openKeyCursor(): never { throw new Error("unused IDL operation"); }
}
class Transaction extends EventTarget implements IDBTransaction {
  objectStoreNames = names; error = null; durability: IDBTransactionDurability = "default";
  onabort: IDBTransaction["onabort"] = null;
  oncomplete: IDBTransaction["oncomplete"] = null;
  onerror: IDBTransaction["onerror"] = null;
  readonly store = new Store(this);
  readonly abort = vi.fn(() => undefined);
  constructor(readonly db: Database, readonly mode: IDBTransactionMode) { super(); }
  objectStore() { return this.store; }
  commit(): never { throw new Error("unused IDL operation"); }
  complete() { this.oncomplete?.call(this, new Event("complete")); }
}
class Database extends EventTarget implements IDBDatabase {
  name = "pirate.guest-authority.v1"; version = 1; objectStoreNames = names;
  onabort: IDBDatabase["onabort"] = null;
  onclose: IDBDatabase["onclose"] = null;
  onerror: IDBDatabase["onerror"] = null;
  onversionchange: IDBDatabase["onversionchange"] = null;
  readonly close = vi.fn(() => undefined);
  readonly transactions: Transaction[] = [];
  transaction(_name: string | Iterable<string>, mode: IDBTransactionMode = "readonly") {
    const tx = new Transaction(this, mode); this.transactions.push(tx); return tx;
  }
  createObjectStore(): never { throw new Error("unexpected upgrade"); }
  deleteObjectStore(): never { throw new Error("unused IDL operation"); }
}
class Factory implements IDBFactory {
  readonly db = new Database();
  readonly request = new OpenRequest(this.db);
  readonly open = vi.fn(() => this.request);
  cmp(): never { throw new Error("unused IDL operation"); }
  databases(): never { throw new Error("unused IDL operation"); }
  deleteDatabase(): never { throw new Error("unused IDL operation"); }
}
const origin = "https://app.pirate.test";
async function firstTransaction(f: Factory): Promise<Transaction> {
  f.request.succeed();
  await Promise.resolve(); await Promise.resolve();
  const tx = f.db.transactions[0];
  if (tx === undefined) throw new Error("transaction was not created");
  return tx;
}
describe("owned IndexedDB settlement", () => {
  afterEach(() => vi.useRealTimers());
  it("bounds an eventless open and closes any successful database arriving after failure", async () => {
    vi.useFakeTimers(); const f = new Factory();
    const store = createIndexedDbGuestAuthorityStore(origin, f, { timeoutMs: 5 });
    const failure = expect(store.read()).rejects.toBeInstanceOf(GuestSelectionStorageError);
    await vi.advanceTimersByTimeAsync(5); await failure;
    f.request.succeed();
    expect(f.db.close).toHaveBeenCalledTimes(1);
    expect(f.db.transactions).toHaveLength(0);
  });
  it("blocked open rejects and owns the later successful handle", async () => {
    const f = new Factory(); const store = createIndexedDbGuestAuthorityStore(origin, f);
    const failure = expect(store.read()).rejects.toBeInstanceOf(GuestSelectionStorageError);
    f.request.blocked(); await failure; f.request.succeed();
    expect(f.db.close).toHaveBeenCalledTimes(1);
    expect(f.db.transactions).toHaveLength(0);
  });
  it.each(["read", "write"] as const)("bounds an eventless %s transaction and suppresses late mutation", async (kind) => {
    vi.useFakeTimers(); const f = new Factory();
    const store = createIndexedDbGuestAuthorityStore(origin, f, { timeoutMs: 5 });
    const mutate = vi.fn(() => undefined);
    const work = kind === "read" ? store.read() : store.update(mutate);
    const failure = expect(work).rejects.toBeInstanceOf(GuestSelectionStorageError);
    const tx = await firstTransaction(f);
    await vi.advanceTimersByTimeAsync(5); await failure;
    expect(tx.abort).toHaveBeenCalledTimes(1); expect(f.db.close).toHaveBeenCalledTimes(1);
    tx.store.getRequest.succeed(); tx.complete();
    expect(mutate).not.toHaveBeenCalled(); expect(tx.store.putCalls).toBe(0);
  });
  it("write request success cannot resolve before transaction commit, then deadline still fails safely", async () => {
    vi.useFakeTimers(); const f = new Factory();
    const store = createIndexedDbGuestAuthorityStore(origin, f, { timeoutMs: 5 });
    let success = false;
    const work = store.update((j) => { j.pointer = { origin, owner_id: "owner", credential_id: "credential", last_start_key: null }; });
    void work.then(() => { success = true; }, () => undefined);
    const failure = expect(work).rejects.toBeInstanceOf(GuestSelectionStorageError);
    const tx = await firstTransaction(f); tx.store.getRequest.succeed(); tx.store.putRequest.succeed();
    await Promise.resolve(); expect(success).toBe(false); expect(tx.store.putCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(5); await failure;
    tx.complete(); await Promise.resolve(); expect(success).toBe(false);
    expect(tx.abort).toHaveBeenCalledTimes(1);
  });
  it("a committed write resolves once, without the old deadline aborting the owned transaction", async () => {
    vi.useFakeTimers(); const f = new Factory();
    const store = createIndexedDbGuestAuthorityStore(origin, f, { timeoutMs: 5 });
    const work = store.update(() => undefined);
    const tx = await firstTransaction(f); tx.store.getRequest.succeed(); tx.complete();
    await work; await vi.advanceTimersByTimeAsync(5);
    expect(tx.abort).not.toHaveBeenCalled(); expect(f.db.close).not.toHaveBeenCalled();
  });
  it("actual coordinator cannot POST a lesson while its IDB pointer write is uncommitted or timed out", async () => {
    vi.useFakeTimers(); vi.stubGlobal("location", { origin });
    try {
      const f = new Factory(); const store = createIndexedDbGuestAuthorityStore(origin, f, { timeoutMs: 5 });
      const proved: GuestAuthority = { object: "guest_authority", state: "confirmed", selected: {
        owner_id: "owner", credential_id: "credential", credential_state: "confirmed", session_until: null,
      }, pointer_repair: null, proved_credentials: [] };
      const api = {
        discoverAuthority: vi.fn<GuestStudyApi["discoverAuthority"]>().mockResolvedValue(proved),
        issueBootstrap: vi.fn<GuestStudyApi["issueBootstrap"]>(), confirmBootstrap: vi.fn<GuestStudyApi["confirmBootstrap"]>(),
        renewAuthority: vi.fn<GuestStudyApi["renewAuthority"]>(), cleanupProof: vi.fn<GuestStudyApi["cleanupProof"]>(),
        startSession: vi.fn<GuestStudyApi["startSession"]>(), findStartOperation: vi.fn<GuestStudyApi["findStartOperation"]>(),
      };
      const c = createGuestStudyStartCoordinator({ api, origin, store, locks: { exclusive: (run) => run() } });
      const work = c.start({ communityId: "community", postId: "post", draft: { target_language: null, learner_band: null,
        timezone: "UTC", reward_mode: "practice_only", reward_preview_terms_hash: null, disclosure: { version: "v1", accepted: true } } });
      const read = await firstTransaction(f); read.store.getRequest.succeed(); read.complete();
      for (let i = 0; i < 30 && f.db.transactions.length < 2; i++) await Promise.resolve();
      const write = f.db.transactions[1];
      if (write === undefined) throw new Error("pointer write not created");
      write.store.getRequest.succeed(); write.store.putRequest.succeed();
      expect(api.startSession).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(5);
      expect(await work).toMatchObject({ status: "pending", phase: "storage" });
      write.complete(); expect(api.startSession).not.toHaveBeenCalled();
      expect(write.abort).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });

});
