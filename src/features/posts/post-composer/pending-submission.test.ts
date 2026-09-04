import { describe, expect, test, vi } from "vitest";

import {
  createIndexedDbPendingSubmissionStorage,
  createDefaultPendingSubmissionStorage,
  createMemoryPendingSubmissionStorage,
  createPendingSubmissionEnvelope,
  PendingSubmissionStorageConflictError,
  pendingBodyBytes,
  pendingSubmissionPrincipalScope,
  PendingSubmissionError,
} from "./pending-submission";
import { bytesToBase64Url, sha256Hex } from "./text-submission-contract";
import {
  IdempotencyConflictError,
  TextSubmissionCoordinator,
  TextSubmissionServerRejectionError,
  type TextSubmissionTransport,
} from "./text-submission-transport";
import {
  createIndexedDbMediaSubmissionStorage,
  createPersistedMediaCommand,
  MEDIA_PENDING_VERSION,
  type PendingMediaSubmissionV1,
} from "../media-submission/pending";

const request = {
  path: { communityId: "community-1" },
  body: {
    idempotency_key: "key-1",
    post_type: "text" as const,
    authorship_mode: "human_direct" as const,
    identity_mode: "public" as const,
    visibility: "public" as const,
    author_declared_rating: "general" as const,
    title: null,
    body: "Hello pirate",
  },
};

const titledRequest = {
  ...request,
  body: { ...request.body, title: "A retained title", body: "A retained body" },
};

const snapshot = {
  submission_id: "sub-1",
  href: "/text-content-submissions/sub-1",
  surface: "text_post" as const,
  status: "published" as const,
  result: { decision: "allow" as const, reason_code: null },
  published_resource: { kind: "post" as const, post_id: "post-1", href: "/posts/post-1" },
  review_ref: null,
  created_at: "2026-08-21T00:00:00Z",
  updated_at: "2026-08-21T00:00:00Z",
};

class FakeRequest {
  result: unknown;
  error: DOMException | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
}

class FakeTransaction {
  readonly mode: IDBTransactionMode;
  readonly controller: FakeIndexedDbController;
  readonly store: FakeStore;
  readonly error: DOMException | null = null;
  writePending = false;
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor(mode: IDBTransactionMode, controller: FakeIndexedDbController, store: FakeStore) {
    this.mode = mode;
    this.controller = controller;
    this.store = store;
  }

  objectStore(): IDBObjectStore {
    return asIdbObjectStore(this.store);
  }

  abort(): void {
    this.onabort?.();
  }
}

function asIdbObjectStore(store: FakeStore): IDBObjectStore {
  // SAFETY: the fake exposes exactly the object-store methods used by the
  // production adapter and controlled transaction test.
  return store as FakeStore & IDBObjectStore;
}

function asIdbRequest(request: FakeRequest): IDBRequest {
  // SAFETY: the fake exposes the request callbacks/result consumed by the
  // production adapter and controlled transaction test.
  return request as FakeRequest & IDBRequest;
}

function asIdbTransaction(transaction: FakeTransaction): IDBTransaction {
  // SAFETY: the fake exposes objectStore, completion, error, and abort hooks
  // consumed by the production adapter and controlled transaction test.
  return transaction as FakeTransaction & IDBTransaction;
}

class FakeStore {
  readonly records = new Map<string, unknown>();
  readonly controller: FakeIndexedDbController;

  constructor(controller: FakeIndexedDbController) {
    this.controller = controller;
  }

  getAll(): IDBRequest {
    const request = new FakeRequest();
    request.result = [...this.records.values()];
    this.controller.queueRequest(request, false);
    return asIdbRequest(request);
  }

  put(value: unknown): IDBRequest {
    const request = new FakeRequest();
    // SAFETY: the test only calls put with the pending envelope key shape.
    const record = value as { pending_request_id?: string; draft_id?: string };
    const key = record.pending_request_id ?? record.draft_id;
    if (key === undefined) throw new Error("fake record key missing");
    request.result = key;
    this.controller.queueRequest(request, true, () => this.records.set(key, value));
    return asIdbRequest(request);
  }

  delete(key: string): IDBRequest {
    const request = new FakeRequest();
    request.result = undefined;
    this.controller.queueRequest(request, true, () => this.records.delete(key));
    return asIdbRequest(request);
  }
}

class FakeDatabase {
  readonly controller: FakeIndexedDbController;
  readonly store: FakeStore;
  readonly objectStoreNames = { contains: () => true };

  constructor(controller: FakeIndexedDbController) {
    this.controller = controller;
    this.store = new FakeStore(controller);
  }

  createObjectStore(): IDBObjectStore {
    return asIdbObjectStore(this.store);
  }

  transaction(mode: IDBTransactionMode): IDBTransaction {
    const transaction = new FakeTransaction(mode, this.controller, this.store);
    this.controller.transactions.push(transaction);
    return asIdbTransaction(transaction);
  }

  close(): void {}
}

class FakeIndexedDbController {
  readonly transactions: FakeTransaction[] = [];
  readonly openedDatabaseNames: string[] = [];
  readonly databases = new Map<string, FakeDatabase>();
  private readonly pendingCommits: Array<{ transaction: FakeTransaction; commit: () => void }> = [];

  get hasPendingCommit(): boolean {
    return this.pendingCommits.length > 0;
  }

  queueRequest(request: FakeRequest, write: boolean, commit: () => void = () => {}): void {
    const transaction = this.transactions.at(-1);
    if (transaction === undefined) throw new Error("fake transaction missing");
    queueMicrotask(() => request.onsuccess?.());
    if (write) {
      transaction.writePending = true;
      this.pendingCommits.push({ transaction, commit });
    } else {
      queueMicrotask(() => {
        if (!transaction.writePending) transaction.oncomplete?.();
      });
    }
  }

  commitWrites(): void {
    const pending = this.pendingCommits.splice(0);
    const transactions = new Set(pending.map(item => item.transaction));
    for (const item of pending) {
      item.commit();
    }
    for (const transaction of transactions) {
      transaction.writePending = false;
      transaction.oncomplete?.();
    }
  }

  factory(): IDBFactory {
    const factory = {
      open: (name: string) => {
        this.openedDatabaseNames.push(name);
        const existing = this.databases.get(name);
        const database = existing ?? new FakeDatabase(this);
        this.databases.set(name, database);
        const request = new FakeRequest();
        queueMicrotask(() => {
          if (existing === undefined) request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        request.result = database;
        return request;
      },
    };
    // SAFETY: the fake exposes only IDBFactory.open, the surface consumed by
    // the production adapter and controlled transaction test.
    return factory as typeof factory & IDBFactory;
  }
}

function transportWith(...results: Array<"ambiguous" | typeof snapshot>): TextSubmissionTransport & { calls: Uint8Array[] } {
  const calls: Uint8Array[] = [];
  return {
    calls,
    async read() {
      return null;
    },
    async dispatch(envelope) {
      calls.push(pendingBodyBytes(envelope));
      const next = results.shift();
      if (next === "ambiguous" || next === undefined) throw new Error("network uncertain");
      return next;
    },
  };
}

describe("pending text submission", () => {
  test("derives a closed principal scope for browser storage", () => {
    expect(pendingSubmissionPrincipalScope(" user/one ")).toBe("principal:user%2Fone");
    expect(() => pendingSubmissionPrincipalScope(" ")).toThrow(PendingSubmissionError);
  });

  test("does not use an in-memory browser fallback when IndexedDB is missing", () => {
    vi.stubGlobal("indexedDB", undefined);
    expect(() => createDefaultPendingSubmissionStorage("user-one")).toThrow(PendingSubmissionError);
    const coordinator = new TextSubmissionCoordinator({ transport: transportWith(snapshot) });
    expect(coordinator.state).toEqual({ status: "transport_failure", reason: "durable_storage_failed" });
    vi.unstubAllGlobals();
  });

  test("waits for IndexedDB transaction commit before allowing dispatch", async () => {
    const controller = new FakeIndexedDbController();
    const storage = createIndexedDbPendingSubmissionStorage("user-one", controller.factory());
    const dispatch = vi.fn(async () => snapshot);
    const coordinator = new TextSubmissionCoordinator({
      storage,
      transport: { read: async () => null, dispatch },
      createPendingRequestId: () => "pending-idb",
    });
    const submitPromise = coordinator.submit(request);
    for (let index = 0; index < 20 && !controller.hasPendingCommit; index += 1) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    expect(controller.hasPendingCommit).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
    controller.commitWrites();
    for (let index = 0; index < 20 && !dispatch.mock.calls.length; index += 1) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    expect(dispatch).toHaveBeenCalledOnce();
    controller.commitWrites();
    await submitPromise;
  });

  test("survives an IndexedDB reload in the same principal scope and resends exact noncanonical bytes", async () => {
    const controller = new FakeIndexedDbController();
    const rawBody = '{  "body":"Hello pirate", "visibility":"public", "identity_mode":"public", "authorship_mode":"human_direct", "post_type":"text", "title":null, "idempotency_key":"key-1" }';
    const rawBytes = new TextEncoder().encode(rawBody);
    const canonical = await createPendingSubmissionEnvelope({
      request,
      sameOriginPath: "/api/communities/community-1/posts",
      pendingRequestId: "pending-idb-reload",
      createdAt: "2026-08-21T00:00:00Z",
    });
    const envelope = {
      ...canonical,
      body_utf8_base64url: bytesToBase64Url(rawBytes),
      body_sha256: await sha256Hex(rawBytes),
    };
    const firstSession = createIndexedDbPendingSubmissionStorage("user-one", controller.factory());
    const savePromise = firstSession.save(envelope);
    for (let index = 0; index < 20 && !controller.hasPendingCommit; index += 1) await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(controller.hasPendingCommit).toBe(true);
    controller.commitWrites();
    await savePromise;

    const calls: Uint8Array[] = [];
    const secondSession = createIndexedDbPendingSubmissionStorage("user-one", controller.factory());
    const reloaded = new TextSubmissionCoordinator({
      storage: secondSession,
      transport: {
        read: async () => null,
        dispatch: async retained => {
          calls.push(pendingBodyBytes(retained));
          return snapshot;
        },
      },
    });
    await reloaded.restore();
    const reconcilePromise = reloaded.reconcile();
    for (let index = 0; index < 20 && calls.length === 0; index += 1) await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(calls).toHaveLength(1);
    expect(new TextDecoder().decode(calls[0])).toBe(rawBody);
    for (let index = 0; index < 20 && !controller.hasPendingCommit; index += 1) await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(controller.hasPendingCommit).toBe(true);
    controller.commitWrites();
    await expect(reconcilePromise).resolves.toEqual(snapshot);
    expect(controller.openedDatabaseNames.every(name => name.endsWith(":principal:user-one"))).toBe(true);
  });

  test("prevents one principal from loading or replaying another principal's IndexedDB record", async () => {
    const controller = new FakeIndexedDbController();
    const first = createIndexedDbPendingSubmissionStorage("user-one", controller.factory());
    const second = createIndexedDbPendingSubmissionStorage("user-two", controller.factory());
    const envelope = await createPendingSubmissionEnvelope({
      request,
      pendingRequestId: "pending-principal-isolation",
      createdAt: "2026-08-21T00:00:00Z",
    });
    const savePromise = first.save(envelope);
    for (let index = 0; index < 20 && !controller.hasPendingCommit; index += 1) await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(controller.hasPendingCommit).toBe(true);
    controller.commitWrites();
    await savePromise;

    expect(await second.loadAll()).toEqual([]);
    const restored = await first.loadAll();
    expect(restored).toHaveLength(1);
    expect(restored[0]?.pending_request_id).toBe("pending-principal-isolation");
    expect(pendingBodyBytes(restored[0]!)).toEqual(pendingBodyBytes(envelope));
    expect(new Set(controller.openedDatabaseNames)).toEqual(new Set([
      "pirate-post-composer-v2:principal:user-one",
      "pirate-post-composer-v2:principal:user-two",
    ]));
  });

  test("admits exactly one of two concurrent distinct unresolved saves", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    const secondRequest = {
      ...request,
      body: { ...request.body, idempotency_key: "key-2" },
    };
    const [first, second] = await Promise.all([
      createPendingSubmissionEnvelope({ request, pendingRequestId: "pending-a", createdAt: "2026-08-21T00:00:00Z" }),
      createPendingSubmissionEnvelope({ request: secondRequest, pendingRequestId: "pending-b", createdAt: "2026-08-21T00:00:01Z" }),
    ]);
    const results = await Promise.allSettled([storage.save(first), storage.save(second)]);
    const fulfilled = results.filter(result => result.status === "fulfilled");
    const rejected = results.filter(result => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(PendingSubmissionStorageConflictError);
    expect(await storage.loadAll()).toHaveLength(1);
  });

  test("retains exact bytes across same-key replay and cleans up after snapshot", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    const transport = transportWith("ambiguous", snapshot);
    const coordinator = new TextSubmissionCoordinator({
      storage,
      transport,
      createPendingRequestId: () => "pending-1",
      now: () => "2026-08-21T00:00:00Z",
    });

    await expect(coordinator.submit(request)).rejects.toThrow("network uncertain");
    expect(coordinator.state).toEqual({ status: "reconciling", pending_request_id: "pending-1" });
    const retained = await storage.load("pending-1");
    expect(retained).not.toBeNull();
    const firstBytes = transport.calls[0];

    await expect(coordinator.reconcile()).resolves.toEqual(snapshot);
    expect(transport.calls[1]).toEqual(firstBytes);
    expect(await storage.load("pending-1")).toBeNull();
    expect(coordinator.state).toEqual({ status: "published", submission_id: "sub-1", post_href: "/posts/post-1" });
  });

  test("restores the same envelope after a simulated reload", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    const envelope = await createPendingSubmissionEnvelope({
      request,
      sameOriginPath: "/api/communities/community-1/posts",
      pendingRequestId: "pending-reload",
      createdAt: "2026-08-21T00:00:00Z",
    });
    await storage.save(envelope);
    const reloaded = new TextSubmissionCoordinator({ storage, transport: transportWith(snapshot) });
    await reloaded.restore();
    expect(reloaded.state).toEqual({ status: "reconciling", pending_request_id: "pending-reload" });
    expect(reloaded.pendingEnvelope?.body_utf8_base64url).toBe(envelope.body_utf8_base64url);
    await reloaded.reconcile();
    expect(await storage.load("pending-reload")).toBeNull();
  });

  test("reads a known submission before replay and never POSTs in that branch", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    const saved = await createPendingSubmissionEnvelope({
      request,
      sameOriginPath: "/api/communities/community-1/posts",
      pendingRequestId: "pending-known",
      createdAt: "2026-08-21T00:00:00Z",
    });
    await storage.save({ ...saved, submission_id: "sub-known" });
    const read = vi.fn(async () => snapshot);
    const dispatch = vi.fn(async () => snapshot);
    const coordinator = new TextSubmissionCoordinator({
      storage,
      transport: { read, dispatch },
    });
    await coordinator.restore();
    await expect(coordinator.reconcile()).resolves.toEqual(snapshot);
    expect(read).toHaveBeenCalledWith("sub-known");
    expect(dispatch).not.toHaveBeenCalled();
    expect(await storage.load("pending-known")).toBeNull();
  });

  test.each([400, 403])("never makes a typed GET %s failure discardable", async status => {
    const storage = createMemoryPendingSubmissionStorage();
    const saved = await createPendingSubmissionEnvelope({ request: titledRequest, pendingRequestId: "pending-known-rejected" });
    await storage.save({ ...saved, submission_id: "sub-known" });
    const dispatch = vi.fn(async () => snapshot);
    const coordinator = new TextSubmissionCoordinator({
      storage,
      transport: {
        read: async () => { throw new TextSubmissionServerRejectionError(status, status === 400 ? "bad_request" : "membership_required"); },
        dispatch,
      },
    });
    await coordinator.restore();
    await expect(coordinator.reconcile()).rejects.toBeInstanceOf(TextSubmissionServerRejectionError);
    expect(coordinator.state).toEqual({ status: "reconciling", pending_request_id: "pending-known-rejected", submission_id: "sub-known" });
    await expect(coordinator.discardRejectedRequest()).rejects.toThrow("Only a definitively rejected request");
    expect(await storage.load("pending-known-rejected")).not.toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
  });

  test("surfaces same-key/different-hash conflicts without replay", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    const dispatch = vi.fn(async () => { throw new IdempotencyConflictError("sub-existing"); });
    const conflictTransport: TextSubmissionTransport = {
      read: async () => null,
      dispatch,
    };
    const coordinator = new TextSubmissionCoordinator({ storage, transport: conflictTransport, createPendingRequestId: () => "pending-conflict" });
    await expect(coordinator.submit(request)).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(coordinator.state).toEqual({
      status: "reconciling",
      pending_request_id: "pending-conflict",
      submission_id: "sub-existing",
      issue: { kind: "idempotency_conflict", submission_id: "sub-existing" },
    });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(await storage.load("pending-conflict")).not.toBeNull();
  });

  test.each([
    [400, "bad_request"],
    [403, "membership_required"],
    [404, "not_found"],
  ] as const)("discards a definitive %s rejection and restores the exact draft", async (status, code) => {
    const storage = createMemoryPendingSubmissionStorage();
    const dispatchedKeys: string[] = [];
    const transport: TextSubmissionTransport = {
      read: async () => null,
      dispatch: async envelope => {
        // SAFETY: the test request fixture is the serialized text body shape.
        dispatchedKeys.push(JSON.parse(new TextDecoder().decode(pendingBodyBytes(envelope))).idempotency_key as string);
        throw new TextSubmissionServerRejectionError(status, code);
      },
    };
    const coordinator = new TextSubmissionCoordinator({
      storage,
      transport,
      createPendingRequestId: (() => {
        const ids = ["pending-rejected", "pending-new"];
        return () => ids.shift() ?? "pending-extra";
      })(),
    });
    await expect(coordinator.submit(titledRequest)).rejects.toBeInstanceOf(TextSubmissionServerRejectionError);
    expect(coordinator.state).toMatchObject({ status: "reconciling", issue: { kind: "server_rejection", status, code } });
    const draft = await coordinator.discardRejectedRequest();
    expect(draft).toEqual({ communityId: "community-1", title: "A retained title", body: "A retained body", authorDeclaredRating: "general" });
    expect(coordinator.state).toEqual({ status: "editing" });
    expect(await storage.loadAll()).toHaveLength(0);
    await expect(coordinator.submit({ ...titledRequest, body: { ...titledRequest.body, idempotency_key: "key-new" } })).rejects.toBeInstanceOf(TextSubmissionServerRejectionError);
    expect(dispatchedKeys).toEqual(["key-1", "key-new"]);
  });

  test.each([413, 422])("does not make HTTP %s discardable in session", async status => {
    const storage = createMemoryPendingSubmissionStorage();
    const coordinator = new TextSubmissionCoordinator({
      storage,
      transport: {
        read: async () => null,
        dispatch: async () => { throw new TextSubmissionServerRejectionError(status, "unprocessable", true); },
      },
      createPendingRequestId: () => "pending-non-definitive-rejection",
    });
    await expect(coordinator.submit(titledRequest)).rejects.toBeInstanceOf(TextSubmissionServerRejectionError);
    expect(coordinator.state).toEqual({ status: "reconciling", pending_request_id: "pending-non-definitive-rejection" });
    await expect(coordinator.discardRejectedRequest()).rejects.toThrow("Only a definitively rejected request");
    expect(await storage.load("pending-non-definitive-rejection")).not.toBeNull();
  });

  test.each([
    [400, "bad_request"],
    [403, "membership_required"],
    [404, "not_found"],
  ] as const)("persists a definitive %s rejection and keeps it blocked after reload", async (status, code) => {
    const storage = createMemoryPendingSubmissionStorage();
    const rejected: TextSubmissionTransport = {
      read: async () => null,
      dispatch: async () => { throw new TextSubmissionServerRejectionError(status, code); },
    };
    const first = new TextSubmissionCoordinator({ storage, transport: rejected, createPendingRequestId: () => "pending-reload-rejected" });
    await expect(first.submit(titledRequest)).rejects.toThrow();
    const reloaded = new TextSubmissionCoordinator({
      storage,
      transport: { read: async () => null, dispatch: async () => snapshot },
    });
    await reloaded.restore();
    expect(reloaded.state).toMatchObject({ status: "reconciling", issue: { kind: "server_rejection", status, code } });
    await expect(reloaded.reconcile()).rejects.toThrow("requires explicit resolution");
    const restored = await reloaded.discardRejectedRequest();
    expect(restored).toEqual({ communityId: "community-1", title: "A retained title", body: "A retained body", authorDeclaredRating: "general" });
  });

  test("does not claim a discardable rejection when metadata persistence fails", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    const calls: Uint8Array[] = [];
    const outcomes: Array<"rejected" | "rejected" | "published"> = ["rejected", "rejected", "published"];
    const transport: TextSubmissionTransport = {
      read: async () => null,
      dispatch: async envelope => {
        calls.push(pendingBodyBytes(envelope));
        const outcome = outcomes.shift();
        if (outcome === "rejected") throw new TextSubmissionServerRejectionError(400, "bad_request");
        return snapshot;
      },
    };
    vi.spyOn(storage, "saveRecord").mockRejectedValueOnce(new Error("metadata quota"));
    const first = new TextSubmissionCoordinator({ storage, transport, createPendingRequestId: () => "pending-metadata-failure" });
    await expect(first.submit(titledRequest)).rejects.toBeInstanceOf(TextSubmissionServerRejectionError);
    expect(first.state).toEqual({ status: "reconciling", pending_request_id: "pending-metadata-failure" });
    const reloaded = new TextSubmissionCoordinator({ storage, transport });
    await reloaded.restore();
    expect(reloaded.state).toEqual({ status: "reconciling", pending_request_id: "pending-metadata-failure" });
    await expect(reloaded.reconcile()).rejects.toBeInstanceOf(TextSubmissionServerRejectionError);
    expect(reloaded.state).toMatchObject({ status: "reconciling", issue: { kind: "server_rejection", status: 400 } });
    expect(calls[1]).toEqual(calls[0]);
    await expect(reloaded.discardRejectedRequest()).resolves.toEqual({ communityId: "community-1", title: "A retained title", body: "A retained body", authorDeclaredRating: "general" });
  });

  test("keeps an idempotency conflict replayable when its metadata save fails", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    let dispatchCount = 0;
    const transport: TextSubmissionTransport = {
      read: async () => null,
      dispatch: async () => {
        dispatchCount += 1;
        throw new IdempotencyConflictError("sub-conflict");
      },
    };
    vi.spyOn(storage, "saveRecord").mockRejectedValueOnce(new Error("metadata quota"));
    const first = new TextSubmissionCoordinator({ storage, transport, createPendingRequestId: () => "pending-conflict-metadata-failure" });
    await expect(first.submit(titledRequest)).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(first.state).toEqual({ status: "reconciling", pending_request_id: "pending-conflict-metadata-failure" });
    const reloaded = new TextSubmissionCoordinator({ storage, transport });
    await reloaded.restore();
    await expect(reloaded.reconcile()).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(reloaded.state).toMatchObject({ status: "reconciling", submission_id: "sub-conflict", issue: { kind: "idempotency_conflict" } });
    expect(dispatchCount).toBe(2);
  });

  test("persists a 409 conflict issue and its learned submission id across reload", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    const first = new TextSubmissionCoordinator({
      storage,
      transport: { read: async () => null, dispatch: async () => { throw new IdempotencyConflictError("sub-existing"); } },
      createPendingRequestId: () => "pending-reload-conflict",
    });
    await expect(first.submit(titledRequest)).rejects.toBeInstanceOf(IdempotencyConflictError);
    const retained = await storage.load("pending-reload-conflict");
    expect(retained?.submission_id).toBe("sub-existing");
    const reloaded = new TextSubmissionCoordinator({ storage, transport: { read: async () => null, dispatch: async () => snapshot } });
    await reloaded.restore();
    expect(reloaded.state).toMatchObject({ status: "reconciling", submission_id: "sub-existing", issue: { kind: "idempotency_conflict" } });
    expect(reloaded.pendingEnvelope?.submission_id).toBe("sub-existing");
    const restored = await reloaded.discardRejectedRequest();
    expect(restored).toEqual({ communityId: "community-1", title: "A retained title", body: "A retained body", authorDeclaredRating: "general" });
  });

  test.each([
    [null, "sub-existing"],
    ["sub-other", "sub-existing"],
  ] as const)("rejects inconsistent persisted conflict metadata (%s / %s)", async (submissionId, issueSubmissionId) => {
    const storage = createMemoryPendingSubmissionStorage();
    const envelope = await createPendingSubmissionEnvelope({ request, pendingRequestId: "pending-corrupt-conflict" });
    storage.records.set(envelope.pending_request_id, envelope);
    storage.recordMetadata?.set(envelope.pending_request_id, {
      issue: { kind: "idempotency_conflict", submission_id: issueSubmissionId },
      submission_id: submissionId,
    });
    await expect(storage.loadAll()).rejects.toThrow("does not match its learned submission id");
  });

  test("adopts one existing unresolved record as plain reconciling state", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    await storage.save(await createPendingSubmissionEnvelope({ request, pendingRequestId: "pending-existing" }));
    const dispatch = vi.fn(async () => snapshot);
    const coordinator = new TextSubmissionCoordinator({ storage, transport: { read: async () => null, dispatch } });
    await expect(coordinator.submit({ ...request, body: { ...request.body, idempotency_key: "key-new" } })).rejects.toThrow("Only one unresolved text submission");
    expect(coordinator.state).toEqual({ status: "reconciling", pending_request_id: "pending-existing" });
    await expect(coordinator.reconcile()).resolves.toEqual(snapshot);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  test("concurrent coordinator loser adopts the winner's durable record", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    let dispatchCalls = 0;
    const transport: TextSubmissionTransport = {
      read: async () => null,
      dispatch: async () => {
        dispatchCalls += 1;
        await Promise.resolve();
        throw new Error("network uncertain");
      },
    };
    const first = new TextSubmissionCoordinator({ storage, transport, createPendingRequestId: () => "pending-race-a" });
    const second = new TextSubmissionCoordinator({ storage, transport, createPendingRequestId: () => "pending-race-b" });
    const results = await Promise.allSettled([first.submit(request), second.submit(request)]);
    expect(results.every(result => result.status === "rejected")).toBe(true);
    expect(dispatchCalls).toBe(1);
    const pendingId = (await storage.loadAll())[0]?.pending_request_id;
    expect(pendingId).toBeDefined();
    expect(first.state).toEqual({ status: "reconciling", pending_request_id: pendingId });
    expect(second.state).toEqual({ status: "reconciling", pending_request_id: pendingId });
  });

  test("selects the oldest record and exposes a storage conflict without hiding records", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    const oldest = await createPendingSubmissionEnvelope({ request, pendingRequestId: "pending-old", createdAt: "2026-08-20T00:00:00Z" });
    const newest = await createPendingSubmissionEnvelope({ request: { ...request, body: { ...request.body, idempotency_key: "key-2" } }, pendingRequestId: "pending-new", createdAt: "2026-08-21T00:00:00Z" });
    await storage.save(oldest);
    storage.records.set(newest.pending_request_id, newest);
    const dispatch = vi.fn(async () => snapshot);
    const coordinator = new TextSubmissionCoordinator({ storage, transport: { read: async () => null, dispatch } });
    await coordinator.restore();
    expect(coordinator.state).toEqual({
      status: "reconciling",
      pending_request_id: "pending-old",
      issue: { kind: "storage_conflict", record_count: 2 },
    });
    await expect(coordinator.reconcile()).rejects.toThrow("requires explicit resolution");
    expect(dispatch).not.toHaveBeenCalled();
    expect((await storage.loadAll()).map(item => item.pending_request_id)).toEqual(["pending-old", "pending-new"]);
  });

  test("resolves the oldest storage conflict before allowing reconciliation", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    const oldest = await createPendingSubmissionEnvelope({ request, pendingRequestId: "pending-old", createdAt: "2026-08-20T00:00:00Z" });
    const newest = await createPendingSubmissionEnvelope({ request: { ...request, body: { ...request.body, idempotency_key: "key-2" } }, pendingRequestId: "pending-new", createdAt: "2026-08-21T00:00:00Z" });
    await storage.save(oldest);
    storage.records.set(newest.pending_request_id, newest);
    const dispatch = vi.fn(async () => snapshot);
    const coordinator = new TextSubmissionCoordinator({ storage, transport: { read: async () => null, dispatch } });
    await coordinator.restore();
    expect(coordinator.resolveOldestPending()).toEqual({ status: "reconciling", pending_request_id: "pending-old" });
    await expect(coordinator.reconcile()).resolves.toEqual(snapshot);
    expect(await storage.load("pending-old")).toBeNull();
    expect(await storage.load("pending-new")).not.toBeNull();
    await coordinator.restore();
    expect(coordinator.state).toEqual({ status: "reconciling", pending_request_id: "pending-new" });
  });

  test("does not overwrite an existing unresolved record when saving a new draft", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    await storage.save(await createPendingSubmissionEnvelope({ request, pendingRequestId: "pending-existing" }));
    await expect(storage.save(await createPendingSubmissionEnvelope({
      request: { ...request, body: { ...request.body, idempotency_key: "key-2" } },
      pendingRequestId: "pending-new",
    }))).rejects.toThrow("Only one unresolved text submission");
    expect(await storage.load("pending-new")).toBeNull();
  });

  test("rejects unsafe same-origin paths at envelope creation", async () => {
    for (const sameOriginPath of ["/\\evil", "/%5Cevil", "//evil.test/posts", "/api/posts?next=/evil", "/api/posts#fragment"]) {
      await expect(createPendingSubmissionEnvelope({ request, sameOriginPath, pendingRequestId: `bad-${sameOriginPath.length}` })).rejects.toThrow("canonical same-origin");
    }
  });

  test("rejects a path escape found in durable storage validation", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    const valid = await createPendingSubmissionEnvelope({ request, pendingRequestId: "pending-path" });
    storage.records.set(valid.pending_request_id, { ...valid, same_origin_path: "/%5Cevil" });
    await expect(storage.load("pending-path")).rejects.toThrow("canonical same-origin");
  });

  test("never reports success for an ambiguous or malformed transport result", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    const transport = transportWith("ambiguous");
    const coordinator = new TextSubmissionCoordinator({ storage, transport, createPendingRequestId: () => "pending-ambiguous" });
    await expect(coordinator.submit(request)).rejects.toThrow();
    expect(coordinator.state.status).toBe("reconciling");
    expect(coordinator.state.status).not.toBe("published");
    expect(await storage.load("pending-ambiguous")).not.toBeNull();
  });

  test("projects storage failures as the only durable-storage transport failure", async () => {
    const storage = createMemoryPendingSubmissionStorage();
    vi.spyOn(storage, "save").mockRejectedValue(new Error("quota"));
    const coordinator = new TextSubmissionCoordinator({ storage, transport: transportWith(snapshot) });
    await expect(coordinator.submit(request)).rejects.toThrow("quota");
    expect(coordinator.state).toEqual({ status: "transport_failure", reason: "durable_storage_failed" });
  });
});

describe("pending media submission IndexedDB", () => {
  test("commits the reservation, exact command bytes, revision, upload state, and snapshot before reload", async () => {
    const controller = new FakeIndexedDbController();
    const storage = createIndexedDbMediaSubmissionStorage("user-one", controller.factory());
    const command = await createPersistedMediaCommand({
      kind: "finalize",
      idempotencyKey: "finalize-key",
      sameOriginPath: "/api/media-post-submissions/sub-1/finalize",
      body: { persona_id: "persona-1", idempotency_key: "finalize-key", expected_creation_revision: 2, reservation_id: "reservation-1" },
    });
    const record: PendingMediaSubmissionV1 = {
      version: MEDIA_PENDING_VERSION,
      draft_id: "draft-media-1",
      principal_id: "user-one",
      community_id: "community-1",
      persona_id: "persona-1",
      song_draft: { title: "Song title", song_type: "original" },
      audio: { blob: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" }), name: "song.mp3", type: "audio/mpeg", size: 3, last_modified: 1 },
      reservation: {
        reservation_id: "reservation-1",
        track: "song",
        slot: "primary_audio",
        status: "awaiting_upload",
        upload: { method: "PUT", url: "https://upload.test/object", required_headers: [], expires_at: "2026-08-27T00:00:00Z" },
      },
      submission_id: "sub-1",
      expected_creation_revision: 2,
      upload_status: "uploaded",
      snapshot: null,
      commands: [command],
      pending_command: command,
      created_at: "2026-08-26T00:00:00Z",
      updated_at: "2026-08-26T00:00:00Z",
    };
    let committed = false;
    const save = storage.save(record).then(() => { committed = true; });
    for (let index = 0; index < 20 && !controller.hasPendingCommit; index += 1) await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(committed).toBe(false);
    controller.commitWrites();
    await save;
    const restored = await createIndexedDbMediaSubmissionStorage("user-one", controller.factory()).loadAll();
    expect(restored[0]).toMatchObject({
      draft_id: "draft-media-1",
      submission_id: "sub-1",
      expected_creation_revision: 2,
      upload_status: "uploaded",
      pending_command: { idempotency_key: "finalize-key", body_sha256: command.body_sha256 },
    });
  });
});
