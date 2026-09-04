import type { PostCommunitiesCommunityIdMediaUploadReservationsResponse } from "@pirate/api-client";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  sha256Hex,
} from "../post-composer/text-submission-contract";
import type { MediaSubmissionSnapshot } from "./contracts";

export const MEDIA_PENDING_VERSION = "media-submission-pending-v1" as const;
export const MEDIA_COMMAND_VERSION = "media-submission-command-v1" as const;

export type MediaCommandKind = "reserve" | "start" | "terms" | "finalize" | "lyrics" | "retry" | "cancel";

export interface PersistedMediaCommand {
  readonly version: typeof MEDIA_COMMAND_VERSION;
  readonly kind: MediaCommandKind;
  readonly idempotency_key: string;
  readonly same_origin_path: string;
  readonly body_utf8_base64url: string;
  readonly body_sha256: string;
}

export type UploadSealStatus = "not_uploaded" | "uploading" | "uploaded" | "sealed";

export interface PendingMediaSubmissionV1 {
  readonly version: typeof MEDIA_PENDING_VERSION;
  readonly draft_id: string;
  readonly principal_id: string;
  readonly community_id: string;
  readonly persona_id: string;
  readonly song_draft: {
    readonly title: string;
    readonly song_type: "original" | "remix";
    readonly author_declared_rating?: "general" | "adult_18";
  };
  readonly audio: {
    readonly blob: Blob;
    readonly name: string;
    readonly type: string;
    readonly size: number;
    readonly last_modified: number;
  };
  readonly reservation: PostCommunitiesCommunityIdMediaUploadReservationsResponse | null;
  readonly submission_id: string | null;
  readonly expected_creation_revision: number | null;
  readonly upload_status: UploadSealStatus;
  readonly snapshot: MediaSubmissionSnapshot | null;
  readonly commands: readonly PersistedMediaCommand[];
  readonly pending_command: PersistedMediaCommand | null;
  readonly issue?: { readonly kind: "idempotency_conflict" | "command_conflict"; readonly submission_id?: string };
  readonly created_at: string;
  readonly updated_at: string;
}

export interface MediaSubmissionStorage {
  readonly load: (draftId: string) => Promise<PendingMediaSubmissionV1 | null>;
  readonly loadAll: () => Promise<readonly PendingMediaSubmissionV1[]>;
  readonly save: (record: PendingMediaSubmissionV1) => Promise<void>;
  readonly remove: (draftId: string) => Promise<void>;
}

export class MediaSubmissionStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaSubmissionStorageError";
  }
}

function assertSafePath(path: string): string {
  if (!path.startsWith("/api/") || path.startsWith("//") || path.includes("?") || path.includes("#")
    || /[\\\u0000-\u001f\u007f]/u.test(path) || /%(?:2f|5c)/iu.test(path)) {
    throw new MediaSubmissionStorageError("Media command path is not a canonical Worker /api path");
  }
  return path;
}

export async function createPersistedMediaCommand(input: {
  readonly kind: MediaCommandKind;
  readonly idempotencyKey: string;
  readonly sameOriginPath: string;
  readonly body: object;
}): Promise<PersistedMediaCommand> {
  const idempotencyKey = input.idempotencyKey.trim();
  if (idempotencyKey === "") throw new MediaSubmissionStorageError("Media command idempotency key is required");
  const bytes = new TextEncoder().encode(JSON.stringify(input.body));
  if (bytes.byteLength > 1_048_576) throw new MediaSubmissionStorageError("Media command exceeds the endpoint body limit");
  return {
    version: MEDIA_COMMAND_VERSION,
    kind: input.kind,
    idempotency_key: idempotencyKey,
    same_origin_path: assertSafePath(input.sameOriginPath),
    body_utf8_base64url: bytesToBase64Url(bytes),
    body_sha256: await sha256Hex(bytes),
  };
}

export async function mediaCommandBody(command: PersistedMediaCommand): Promise<Uint8Array> {
  if (command.version !== MEDIA_COMMAND_VERSION || !/^[a-f0-9]{64}$/u.test(command.body_sha256)) {
    throw new MediaSubmissionStorageError("Stored media command is invalid");
  }
  assertSafePath(command.same_origin_path);
  const bytes = base64UrlToBytes(command.body_utf8_base64url);
  if (await sha256Hex(bytes) !== command.body_sha256) throw new MediaSubmissionStorageError("Stored media command digest does not match its bytes");
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MediaSubmissionStorageError("Stored media command body is invalid");
  }
  // SAFETY: the representation was checked as an object before the retained
  // idempotency-key field is inspected.
  const parsed = value as { idempotency_key?: unknown };
  if (parsed.idempotency_key !== command.idempotency_key) {
    throw new MediaSubmissionStorageError("Stored media command key does not match its body");
  }
  return bytes;
}

export function createMemoryMediaSubmissionStorage(
  records = new Map<string, PendingMediaSubmissionV1>(),
): MediaSubmissionStorage & { readonly records: Map<string, PendingMediaSubmissionV1> } {
  return {
    records,
    async load(draftId) { return records.get(draftId) ?? null; },
    async loadAll() { return [...records.values()]; },
    async save(record) { records.set(record.draft_id, record); },
    async remove(draftId) { records.delete(draftId); },
  };
}

const MEDIA_DB_PREFIX = "pirate-media-composer-v1";
const MEDIA_STORE = "submissions";

function principalScope(principalId: string): string {
  const value = principalId.trim();
  if (value === "" || value.length > 512 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new MediaSubmissionStorageError("A valid principal is required for media submission storage");
  }
  return encodeURIComponent(value);
}

export function createIndexedDbMediaSubmissionStorage(
  principalId: string,
  factory: IDBFactory = indexedDB,
): MediaSubmissionStorage {
  const databaseName = `${MEDIA_DB_PREFIX}:${principalScope(principalId)}`;
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(MEDIA_STORE)) request.result.createObjectStore(MEDIA_STORE, { keyPath: "draft_id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new MediaSubmissionStorageError("IndexedDB open failed"));
  });
  const transaction = async <T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const database = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = database.transaction(MEDIA_STORE, mode);
      const request = run(tx.objectStore(MEDIA_STORE));
      let result: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error ?? new MediaSubmissionStorageError("IndexedDB request failed"));
      tx.oncomplete = () => { database.close(); resolve(result); };
      tx.onerror = () => { database.close(); reject(tx.error ?? new MediaSubmissionStorageError("IndexedDB transaction failed")); };
      tx.onabort = () => { database.close(); reject(tx.error ?? new MediaSubmissionStorageError("IndexedDB transaction aborted")); };
    });
  };
  return {
    async load(draftId) { return (await transaction<PendingMediaSubmissionV1 | undefined>("readonly", store => store.get(draftId))) ?? null; },
    async loadAll() { return transaction<PendingMediaSubmissionV1[]>("readonly", store => store.getAll()); },
    async save(record) {
      if (record.principal_id !== principalId) throw new MediaSubmissionStorageError("Media record belongs to another principal");
      await transaction<IDBValidKey>("readwrite", store => store.put(record));
    },
    async remove(draftId) { await transaction<undefined>("readwrite", store => store.delete(draftId)); },
  };
}

export function createDefaultMediaSubmissionStorage(principalId?: string): MediaSubmissionStorage {
  if (typeof window === "undefined") return createMemoryMediaSubmissionStorage();
  if (principalId === undefined || typeof indexedDB === "undefined") {
    throw new MediaSubmissionStorageError("IndexedDB and a principal are required in the browser");
  }
  return createIndexedDbMediaSubmissionStorage(principalId);
}
