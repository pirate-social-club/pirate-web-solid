import { describe, expect, test, vi } from "vitest";

import { pendingBodyBytes } from "../post-composer/pending-submission.ts";
import { bytesToBase64Url, sha256Hex } from "../post-composer/text-submission-contract.ts";
import { createPostEngagementTransport } from "./post-engagement-api.ts";
import {
  commentSubmissionSlot,
  createIndexedDbPendingEngagementStorage,
  createMemoryPendingEngagementStorage,
  createPendingEngagementRecord,
  decodePendingEngagementAction,
  PendingEngagementConflictError,
  postVoteSlot,
} from "./post-engagement-pending.ts";

const context = { principalId: "user-1", postId: "post-1" } as const;

class FakeRequest {
  result: unknown;
  error: DOMException | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onupgradeneeded: (() => void) | null = null;
}

class FakeTransaction {
  readonly error: DOMException | null = null;
  writePending = false;
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor(readonly controller: FakeIndexedDbController) {}
  objectStore(): IDBObjectStore {
    // SAFETY: the fake implements every object-store method used by the adapter.
    return this.controller.store as FakeStore & IDBObjectStore;
  }
}

class FakeStore {
  readonly records = new Map<string, unknown>();
  constructor(readonly controller: FakeIndexedDbController) {}

  private request(result: unknown, write = false, commit: () => void = () => {}): IDBRequest {
    const request = new FakeRequest();
    request.result = result;
    this.controller.queueRequest(request, write, commit);
    // SAFETY: the fake implements the request fields and callbacks used by the adapter.
    return request as FakeRequest & IDBRequest;
  }

  get(key: string): IDBRequest { return this.request(this.records.get(key)); }
  getAll(): IDBRequest { return this.request([...this.records.values()]); }
  add(value: unknown): IDBRequest {
    // SAFETY: the adapter calls add only after validating the record slot.
    const record = value as { readonly slot: string };
    return this.request(record.slot, true, () => this.records.set(record.slot, value));
  }
  put(value: unknown): IDBRequest {
    // SAFETY: the adapter calls put only after validating the record slot.
    const record = value as { readonly slot: string };
    return this.request(record.slot, true, () => this.records.set(record.slot, value));
  }
  delete(key: string): IDBRequest { return this.request(undefined, true, () => this.records.delete(key)); }
}

class FakeDatabase {
  constructor(readonly controller: FakeIndexedDbController) {}
  createObjectStore(): IDBObjectStore {
    // SAFETY: the fake implements every object-store method used by the adapter.
    return this.controller.store as FakeStore & IDBObjectStore;
  }
  transaction(): IDBTransaction {
    const transaction = new FakeTransaction(this.controller);
    this.controller.transactions.push(transaction);
    // SAFETY: the fake implements the transaction hooks used by the adapter.
    return transaction as FakeTransaction & IDBTransaction;
  }
  close(): void {}
}

class FakeIndexedDbController {
  readonly store = new FakeStore(this);
  readonly database = new FakeDatabase(this);
  readonly transactions: FakeTransaction[] = [];
  private readonly pendingCommits: Array<{ readonly transaction: FakeTransaction; readonly commit: () => void }> = [];

  get hasPendingCommit(): boolean { return this.pendingCommits.length > 0; }

  queueRequest(request: FakeRequest, write: boolean, commit: () => void): void {
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
    for (const item of pending) item.commit();
    for (const transaction of transactions) {
      transaction.writePending = false;
      transaction.oncomplete?.();
    }
  }

  factory(): IDBFactory {
    const factory = {
      open: () => {
        const request = new FakeRequest();
        request.result = this.database;
        queueMicrotask(() => {
          request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        return request;
      },
    };
    // SAFETY: the fake implements IDBFactory.open, the only factory method used here.
    return factory as typeof factory & IDBFactory;
  }
}

async function waitForPendingCommit(controller: FakeIndexedDbController): Promise<void> {
  for (let index = 0; index < 20 && !controller.hasPendingCommit; index += 1) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  expect(controller.hasPendingCommit).toBe(true);
}

describe("pending post engagement", () => {
  test("retains one serialized comment body and key byte-for-byte across reload", async () => {
    const backing = { records: new Map() };
    const firstSession = createMemoryPendingEngagementStorage(backing);
    const record = await createPendingEngagementRecord({
      kind: "comment",
      postId: "post-1",
      body: "Keep  spacing and punctuation!",
      idempotencyKey: "comment-key",
    }, context);
    await firstSession.saveNew(record);

    const secondSession = createMemoryPendingEngagementStorage(backing);
    const restored = await secondSession.load(commentSubmissionSlot("user-1", "post-1"));
    expect(restored).not.toBeNull();
    if (restored === null) throw new Error("pending record missing after reload");
    expect(restored.envelope).toEqual(record.envelope);
    expect(pendingBodyBytes(restored.envelope)).toEqual(pendingBodyBytes(record.envelope));
    expect(await decodePendingEngagementAction(restored.envelope)).toEqual({
      kind: "comment",
      postId: "post-1",
      body: "Keep  spacing and punctuation!",
      idempotencyKey: "comment-key",
    });
  });

  test("isolates retained actions by authenticated principal", async () => {
    const storage = createMemoryPendingEngagementStorage();
    await storage.saveNew(await createPendingEngagementRecord({
      kind: "comment", postId: "post-1", body: "Private retry", idempotencyKey: "key-1",
    }, context));
    expect(await storage.listForPost("user-1", "post-1")).toHaveLength(1);
    expect(await storage.listForPost("user-2", "post-1")).toEqual([]);
  });

  test("does not replace an unresolved slot with a new vote intent", async () => {
    const storage = createMemoryPendingEngagementStorage();
    const first = await createPendingEngagementRecord({ kind: "vote", postId: "post-1", value: 1, idempotencyKey: "up-key" }, context);
    const second = await createPendingEngagementRecord({ kind: "vote", postId: "post-1", value: -1, idempotencyKey: "down-key" }, context);
    await storage.saveNew(first);
    await expect(storage.saveNew(second)).rejects.toBeInstanceOf(PendingEngagementConflictError);
    const retained = await storage.load(postVoteSlot("user-1", "post-1"));
    expect(retained?.envelope.idempotency_key).toBe("up-key");
  });

  test("survives an IndexedDB reload and resends noncanonical JSON bytes exactly", async () => {
    const controller = new FakeIndexedDbController();
    const original = await createPendingEngagementRecord({
      kind: "comment", postId: "post-1", body: "Exact  body", idempotencyKey: "idb-key",
    }, context);
    const raw = '{\n  "body" : "Exact  body",\n  "idempotency_key" : "idb-key"\n}';
    const bytes = new TextEncoder().encode(raw);
    const record = {
      ...original,
      envelope: {
        ...original.envelope,
        body_utf8_base64url: bytesToBase64Url(bytes),
        body_sha256: await sha256Hex(bytes),
      },
    };
    const firstSession = createIndexedDbPendingEngagementStorage(controller.factory());
    const save = firstSession.saveNew(record);
    await waitForPendingCommit(controller);
    controller.commitWrites();
    await save;

    const secondSession = createIndexedDbPendingEngagementStorage(controller.factory());
    const restored = await secondSession.load(record.slot);
    expect(restored?.envelope.idempotency_key).toBe("idb-key");
    expect(restored && new TextDecoder().decode(pendingBodyBytes(restored.envelope))).toBe(raw);

    let sentBody = "";
    const transport = createPostEngagementTransport({
      origin: "https://solid.example",
      csrfToken: () => "csrf-token",
      fetchImpl: vi.fn(async (_input, init) => {
        sentBody = new TextDecoder().decode(init?.body instanceof ArrayBuffer ? new Uint8Array(init.body) : new Uint8Array());
        return new Response(JSON.stringify({
          submission_id: "submission-1",
          href: "/comments/comment-1",
          surface: "comment",
          status: "published",
          result: { decision: "allow", reason_code: null },
          published_resource: { kind: "comment", comment_id: "comment-1", href: "/comments/comment-1" },
          review_ref: null,
          created_at: "2026-08-23T00:00:00Z",
          updated_at: "2026-08-23T00:00:00Z",
        }), { status: 201, headers: { "content-type": "application/json" } });
      }),
    });
    if (restored === null) throw new Error("IndexedDB record missing after reload");
    await transport.createComment(restored.envelope);
    expect(sentBody).toBe(raw);
  });
});
