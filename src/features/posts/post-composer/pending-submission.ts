import {
  base64UrlToBytes,
  bytesToBase64Url,
  decodeTextContentSubmissionRequest,
  serializeTextSubmissionRequest,
  sha256Hex,
  TextSubmissionContractError,
  type TextContentSubmissionRequestEnvelopeV1,
} from "./text-submission-contract";

export const PENDING_SUBMISSION_VERSION = "pending-submission-v1" as const;
export const PENDING_SUBMISSION_RECORD_VERSION = "pending-submission-record-v1" as const;
export const PENDING_SUBMISSION_CONTENT_TYPE = "application/json" as const;
export const MAX_PENDING_BODY_BYTES = 1_048_576;
export type DefinitiveServerRejectionStatus = 400 | 403 | 404;

export interface PendingSubmissionEnvelopeV1 {
  readonly version: typeof PENDING_SUBMISSION_VERSION;
  readonly pending_request_id: string;
  readonly idempotency_key: string;
  readonly method: "POST";
  readonly same_origin_path: string;
  readonly content_type: typeof PENDING_SUBMISSION_CONTENT_TYPE;
  readonly body_utf8_base64url: string;
  readonly body_sha256: string;
  readonly submission_id: string | null;
  readonly created_at: string;
}

/** Persisted only beside the exact request envelope, never in its body. */
export type PendingSubmissionIssue =
  | { readonly kind: "idempotency_conflict"; readonly submission_id: string }
  | { readonly kind: "server_rejection"; readonly status: DefinitiveServerRejectionStatus; readonly code: string };

export interface PendingSubmissionRecordMetadata {
  readonly issue?: PendingSubmissionIssue;
  readonly submission_id?: string | null;
}

export interface PendingSubmissionStoredRecord {
  readonly version: typeof PENDING_SUBMISSION_RECORD_VERSION;
  readonly pending_request_id: string;
  readonly envelope: PendingSubmissionEnvelopeV1;
  readonly issue?: PendingSubmissionIssue;
  readonly submission_id: string | null;
}

export class PendingSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PendingSubmissionError";
  }
}

export class PendingSubmissionStorageConflictError extends Error {
  readonly records: readonly PendingSubmissionEnvelopeV1[];

  constructor(records: readonly PendingSubmissionEnvelopeV1[]) {
    super("Only one unresolved text submission may exist in this storage namespace");
    this.name = "PendingSubmissionStorageConflictError";
    this.records = records;
  }
}

export function isDefinitiveServerRejectionStatus(value: unknown): value is DefinitiveServerRejectionStatus {
  return value === 400 || value === 403 || value === 404;
}

function isPendingIssue(value: unknown): value is PendingSubmissionIssue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  // SAFETY: the preceding branch establishes a non-array object before the
  // closed metadata fields are inspected.
  const issue = value as { kind?: unknown; status?: unknown; code?: unknown; submission_id?: unknown };
  if (issue.kind === "idempotency_conflict") {
    return typeof issue.submission_id === "string" && issue.submission_id.length > 0;
  }
  return issue.kind === "server_rejection"
    && isDefinitiveServerRejectionStatus(issue.status)
    && typeof issue.code === "string"
    && issue.code.length > 0;
}

/** Only the closed, durable issue set may unlock discard-and-edit recovery. */
export function isDiscardablePendingSubmissionIssue(value: unknown): value is PendingSubmissionIssue {
  return isPendingIssue(value);
}

function decodeRecordMetadata(value: unknown): PendingSubmissionRecordMetadata {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PendingSubmissionError("Invalid pending record metadata");
  }
  // SAFETY: the preceding branch establishes a non-array object before the
  // closed metadata fields are inspected.
  const metadata = value as { issue?: unknown; submission_id?: unknown };
  if (metadata.issue !== undefined && !isPendingIssue(metadata.issue)) {
    throw new PendingSubmissionError("Invalid pending record issue");
  }
  if (metadata.submission_id !== undefined && metadata.submission_id !== null && typeof metadata.submission_id !== "string") {
    throw new PendingSubmissionError("Invalid pending record submission id");
  }
  return {
    ...(metadata.issue === undefined ? {} : { issue: metadata.issue }),
    ...(metadata.submission_id === undefined ? {} : { submission_id: metadata.submission_id }),
  };
}

function recordEnvelope(record: PendingSubmissionStoredRecord): PendingSubmissionEnvelopeV1 {
  if (record.submission_id === record.envelope.submission_id || record.submission_id === null) return record.envelope;
  return { ...record.envelope, submission_id: record.submission_id };
}

function decodeStoredRecord(value: unknown): PendingSubmissionStoredRecord {
  // Accept the pre-wrapper envelope shape so existing browser records can be
  // recovered and rewritten through the new durable record boundary.
  if (isRecord(value) && value.envelope !== undefined) {
    if (value.version !== PENDING_SUBMISSION_RECORD_VERSION) throw new PendingSubmissionError("Unsupported pending submission record");
    const envelope = decodePendingSubmissionEnvelope(value.envelope);
    const pendingRequestId = requiredString(value.pending_request_id, "pending_request_id");
    if (pendingRequestId !== envelope.pending_request_id) throw new PendingSubmissionError("Pending record key does not match envelope");
    const metadata = decodeRecordMetadata({ issue: value.issue, submission_id: value.submission_id });
    if (metadata.issue?.kind === "idempotency_conflict" && (
      metadata.submission_id === undefined
      || metadata.submission_id === null
      || metadata.submission_id !== metadata.issue.submission_id
    )) {
      throw new PendingSubmissionError("Pending conflict metadata does not match its learned submission id");
    }
    if (metadata.submission_id !== undefined && metadata.submission_id !== null && envelope.submission_id !== null && metadata.submission_id !== envelope.submission_id) {
      throw new PendingSubmissionError("Pending record submission id does not match its envelope");
    }
    const submissionId = metadata.submission_id ?? envelope.submission_id;
    return {
      version: PENDING_SUBMISSION_RECORD_VERSION,
      pending_request_id: pendingRequestId,
      envelope,
      ...(metadata.issue === undefined ? {} : { issue: metadata.issue }),
      submission_id: submissionId,
    };
  }
  const envelope = decodePendingSubmissionEnvelope(value);
  return { version: PENDING_SUBMISSION_RECORD_VERSION, pending_request_id: envelope.pending_request_id, envelope, submission_id: envelope.submission_id };
}

function makeStoredRecord(envelope: PendingSubmissionEnvelopeV1, metadata: PendingSubmissionRecordMetadata = {}): PendingSubmissionStoredRecord {
  const decoded = decodeRecordMetadata(metadata);
  if (decoded.issue?.kind === "idempotency_conflict" && (
    decoded.submission_id === undefined
    || decoded.submission_id === null
    || decoded.submission_id !== decoded.issue.submission_id
  )) {
    throw new PendingSubmissionError("Pending conflict metadata does not match its learned submission id");
  }
  if (decoded.submission_id !== undefined && decoded.submission_id !== null && envelope.submission_id !== null && decoded.submission_id !== envelope.submission_id) {
    throw new PendingSubmissionError("Pending record submission id does not match its envelope");
  }
  return {
    version: PENDING_SUBMISSION_RECORD_VERSION,
    pending_request_id: envelope.pending_request_id,
    envelope,
    ...(decoded.issue === undefined ? {} : { issue: decoded.issue }),
    submission_id: decoded.submission_id ?? envelope.submission_id,
  };
}

export interface RestoredTextSubmissionDraft {
  readonly communityId: string;
  readonly title: string;
  readonly body: string;
  readonly authorDeclaredRating: "general" | "adult_18";
}

export function assertSafeSameOriginPath(path: string): string {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\\u0000-\u001F\u007F]/u.test(path) ||
    /%(?:2f|5c)/iu.test(path) ||
    path.includes("?") ||
    path.includes("#")
  ) {
    throw new PendingSubmissionError("Pending path must be a canonical same-origin path");
  }
  const parsed = new URL(path, "https://same-origin.invalid");
  if (parsed.origin !== "https://same-origin.invalid" || parsed.pathname !== path || parsed.search !== "" || parsed.hash !== "") {
    throw new PendingSubmissionError("Pending path must be a canonical same-origin path");
  }
  return path;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new PendingSubmissionError(`Invalid pending field: ${field}`);
  return value;
}

interface RawPendingObject {
  readonly version?: unknown;
  readonly method?: unknown;
  readonly content_type?: unknown;
  readonly body_utf8_base64url?: unknown;
  readonly body_sha256?: unknown;
  readonly same_origin_path?: unknown;
  readonly pending_request_id?: unknown;
  readonly idempotency_key?: unknown;
  readonly submission_id?: unknown;
  readonly created_at?: unknown;
  readonly envelope?: unknown;
  readonly issue?: unknown;
}

function isRecord(value: unknown): value is RawPendingObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function decodePendingSubmissionEnvelope(value: unknown): PendingSubmissionEnvelopeV1 {
  if (!isRecord(value)) throw new PendingSubmissionError("Pending submission must be an object");
  if (value.version !== PENDING_SUBMISSION_VERSION || value.method !== "POST" || value.content_type !== PENDING_SUBMISSION_CONTENT_TYPE) {
    throw new PendingSubmissionError("Unsupported pending submission envelope");
  }
  const body = requiredString(value.body_utf8_base64url, "body_utf8_base64url");
  const digest = requiredString(value.body_sha256, "body_sha256");
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw new PendingSubmissionError("Invalid pending body hash");
  const path = assertSafeSameOriginPath(requiredString(value.same_origin_path, "same_origin_path"));
  const submissionId = value.submission_id;
  if (submissionId !== null && typeof submissionId !== "string") throw new PendingSubmissionError("Invalid pending submission id");
  try {
    const bytes = base64UrlToBytes(body);
    if (bytes.byteLength > MAX_PENDING_BODY_BYTES) throw new PendingSubmissionError("Pending body exceeds endpoint limit");
  } catch (error) {
    if (error instanceof PendingSubmissionError) throw error;
    throw new PendingSubmissionError("Invalid pending body encoding");
  }
  return {
    version: PENDING_SUBMISSION_VERSION,
    pending_request_id: requiredString(value.pending_request_id, "pending_request_id"),
    idempotency_key: requiredString(value.idempotency_key, "idempotency_key"),
    method: "POST",
    same_origin_path: path,
    content_type: PENDING_SUBMISSION_CONTENT_TYPE,
    body_utf8_base64url: body,
    body_sha256: digest,
    submission_id: submissionId,
    created_at: requiredString(value.created_at, "created_at"),
  };
}

export function pendingBodyBytes(envelope: PendingSubmissionEnvelopeV1): Uint8Array {
  const decoded = base64UrlToBytes(envelope.body_utf8_base64url);
  if (decoded.byteLength > MAX_PENDING_BODY_BYTES) throw new PendingSubmissionError("Pending body exceeds endpoint limit");
  return decoded;
}

export function decodePendingSubmissionDraft(envelope: PendingSubmissionEnvelopeV1): RestoredTextSubmissionDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(pendingBodyBytes(envelope)));
  } catch {
    throw new PendingSubmissionError("Pending body is not valid UTF-8 JSON");
  }
  let request: ReturnType<typeof decodeTextContentSubmissionRequest>;
  try {
    request = decodeTextContentSubmissionRequest(parsed);
  } catch (error) {
    throw new PendingSubmissionError(error instanceof Error ? error.message : "Pending body has an invalid request shape");
  }
  if (request.idempotency_key !== envelope.idempotency_key) {
    throw new PendingSubmissionError("Pending body idempotency key does not match");
  }
  const match = /^\/api\/communities\/([^/]+)\/posts$/u.exec(envelope.same_origin_path);
  if (match?.[1] === undefined) throw new PendingSubmissionError("Pending path is not a text post path");
  let communityId: string;
  try {
    communityId = decodeURIComponent(match[1]);
  } catch {
    throw new PendingSubmissionError("Pending community path is not valid encoding");
  }
  if (communityId === "") throw new PendingSubmissionError("Pending community path is empty");
  return { communityId, title: request.title ?? "", body: request.body, authorDeclaredRating: request.author_declared_rating };
}

interface RawRequestBody {
  readonly idempotency_key?: unknown;
}

function isRequestObject(value: unknown): value is RawRequestBody {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate the retained digest and the key/body binding at a storage boundary. */
export async function validatePendingSubmissionEnvelope(
  value: unknown,
): Promise<PendingSubmissionEnvelopeV1> {
  const envelope = decodePendingSubmissionEnvelope(value);
  const bytes = pendingBodyBytes(envelope);
  if (await sha256Hex(bytes) !== envelope.body_sha256) throw new PendingSubmissionError("Pending body hash does not match");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new PendingSubmissionError("Pending body is not valid UTF-8 JSON");
  }
  if (!isRequestObject(parsed) || parsed.idempotency_key !== envelope.idempotency_key) {
    throw new PendingSubmissionError("Pending body idempotency key does not match");
  }
  return envelope;
}

export async function createPendingSubmissionEnvelope(options: {
  readonly request: TextContentSubmissionRequestEnvelopeV1;
  readonly sameOriginPath?: string;
  readonly pendingRequestId: string;
  readonly createdAt?: string;
}): Promise<PendingSubmissionEnvelopeV1> {
  const serialized = serializeTextSubmissionRequest(options.request);
  if (serialized.bytes.byteLength > MAX_PENDING_BODY_BYTES) {
    throw new TextSubmissionContractError("Text submission body exceeds endpoint limit");
  }
  const candidatePath = options.sameOriginPath
    ?? `/api/communities/${encodeURIComponent(serialized.normalized.path.communityId)}/posts`;
  let sameOriginPath: string;
  try {
    sameOriginPath = assertSafeSameOriginPath(candidatePath);
  } catch (error) {
    throw new TextSubmissionContractError(error instanceof Error ? error.message : "Pending path must be canonical");
  }
  const bodyUtf8Base64Url = bytesToBase64Url(serialized.bytes);
  return {
    version: PENDING_SUBMISSION_VERSION,
    pending_request_id: options.pendingRequestId,
    idempotency_key: serialized.normalized.body.idempotency_key,
    method: "POST",
    same_origin_path: sameOriginPath,
    content_type: PENDING_SUBMISSION_CONTENT_TYPE,
    body_utf8_base64url: bodyUtf8Base64Url,
    body_sha256: await sha256Hex(serialized.bytes),
    submission_id: null,
    created_at: options.createdAt ?? new Date().toISOString(),
  };
}

export interface PendingSubmissionStorage {
  readonly load: (pendingRequestId: string) => Promise<PendingSubmissionEnvelopeV1 | null>;
  readonly loadAll: () => Promise<readonly PendingSubmissionEnvelopeV1[]>;
  readonly save: (envelope: PendingSubmissionEnvelopeV1) => Promise<void>;
  readonly remove: (pendingRequestId: string) => Promise<void>;
  readonly loadRecord?: (pendingRequestId: string) => Promise<PendingSubmissionStoredRecord | null>;
  readonly loadAllRecords?: () => Promise<readonly PendingSubmissionStoredRecord[]>;
  readonly saveRecord?: (record: PendingSubmissionStoredRecord) => Promise<void>;
}

export interface MemoryPendingSubmissionBacking {
  readonly records: Map<string, PendingSubmissionEnvelopeV1>;
  readonly recordMetadata?: Map<string, PendingSubmissionRecordMetadata>;
}

/** Deterministic adapter used by unit tests and SSR-safe local previews. */
export function createMemoryPendingSubmissionStorage(
  backing: MemoryPendingSubmissionBacking = { records: new Map() },
): PendingSubmissionStorage & MemoryPendingSubmissionBacking {
  const metadata = backing.recordMetadata ?? new Map<string, PendingSubmissionRecordMetadata>();
  if (backing.recordMetadata === undefined) {
    Object.defineProperty(backing, "recordMetadata", { value: metadata, enumerable: true });
  }
  const loadRecord = async (pendingRequestId: string): Promise<PendingSubmissionStoredRecord | null> => {
    const value = backing.records.get(pendingRequestId);
    if (value === undefined) return null;
    const envelope = await validatePendingSubmissionEnvelope(value);
    const recordMetadata = decodeRecordMetadata(metadata.get(pendingRequestId));
    return makeStoredRecord(envelope, recordMetadata);
  };
  const loadAllRecords = async (): Promise<readonly PendingSubmissionStoredRecord[]> => {
    const records = await Promise.all([...backing.records.keys()].map(loadRecord));
    return records.filter((record): record is PendingSubmissionStoredRecord => record !== null);
  };
  const saveRecord = async (record: PendingSubmissionStoredRecord): Promise<void> => {
    const decoded = await validatePendingSubmissionEnvelope(record.envelope);
    const stored = makeStoredRecord(decoded, record);
    const existing = [...backing.records.values()];
    if (existing.some(value => value.pending_request_id !== decoded.pending_request_id)) {
      throw new PendingSubmissionStorageConflictError(existing);
    }
    // Validation is complete before this synchronous critical section.
    backing.records.set(decoded.pending_request_id, decoded);
    metadata.set(decoded.pending_request_id, {
      ...(stored.issue === undefined ? {} : { issue: stored.issue }),
      submission_id: stored.submission_id,
    });
  };
  return {
    records: backing.records,
    recordMetadata: metadata,
    async load(pendingRequestId) {
      const record = await loadRecord(pendingRequestId);
      return record === null ? null : recordEnvelope(record);
    },
    async loadAll() {
      const records = await loadAllRecords();
      return records.map(recordEnvelope);
    },
    async save(envelope) {
      await saveRecord(makeStoredRecord(envelope));
    },
    loadRecord,
    loadAllRecords,
    saveRecord,
    async remove(pendingRequestId) {
      backing.records.delete(pendingRequestId);
      metadata.delete(pendingRequestId);
    },
  };
}

const PENDING_DB_NAME = "pirate-post-composer-v2";
const PENDING_STORE_NAME = "pending-submissions";

export function pendingSubmissionPrincipalScope(principalId: string): string {
  const principal = principalId.trim();
  if (principal === "" || principal.length > 512 || /[\u0000-\u001f\u007f]/u.test(principal)) {
    throw new PendingSubmissionError("A valid principal is required for pending submission storage");
  }
  return `principal:${encodeURIComponent(principal)}`;
}

/** IndexedDB is same-origin browser storage; no authentication data is stored. */
export function createIndexedDbPendingSubmissionStorage(
  principalId: string,
  indexedDb?: IDBFactory,
): PendingSubmissionStorage {
  const factory = indexedDb ?? globalThis.indexedDB;
  const databaseName = `${PENDING_DB_NAME}:${pendingSubmissionPrincipalScope(principalId)}`;
  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (factory === undefined) {
        reject(new PendingSubmissionError("IndexedDB is unavailable"));
        return;
      }
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(databaseName, 1);
      } catch (error) {
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        request.result.createObjectStore(PENDING_STORE_NAME, { keyPath: "pending_request_id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    });
  }

  async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
    const database = await open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(PENDING_STORE_NAME, mode);
      const store = tx.objectStore(PENDING_STORE_NAME);
      let request: IDBRequest | void;
      try {
        request = action(store);
      } catch (error) {
        database.close();
        reject(error);
        return;
      }
      if (request !== undefined) {
        // SAFETY: each caller supplies the IDB result shape it validates below.
        request.onsuccess = () => {
          // Do not resolve here: IndexedDB has not committed the transaction.
        };
        request.onerror = () => {
          // The transaction's abort/error handlers own rejection.
        };
      }
      tx.oncomplete = () => {
        database.close();
        if (request === undefined) resolve(undefined);
        else {
          // SAFETY: each transaction caller supplies a request whose result is
          // the T value returned after the transaction has committed.
          resolve(request.result as T);
        }
      };
      tx.onerror = () => {
        database.close();
        reject(tx.error ?? new Error("IndexedDB transaction failed"));
      };
      tx.onabort = () => {
        database.close();
        reject(tx.error ?? new Error("IndexedDB transaction aborted"));
      };
    });
  }

  return {
    async load(pendingRequestId) {
      const value = await transaction<unknown>("readonly", store => store.get(pendingRequestId));
      if (value === undefined) return null;
      const record = decodeStoredRecord(value);
      await validatePendingSubmissionEnvelope(record.envelope);
      return recordEnvelope(record);
    },
    async loadAll() {
      const value = await transaction<unknown[]>("readonly", store => store.getAll());
      if (!Array.isArray(value)) throw new PendingSubmissionError("IndexedDB returned invalid pending records");
      const records = value.map(decodeStoredRecord);
      await Promise.all(records.map(record => validatePendingSubmissionEnvelope(record.envelope)));
      return records.map(recordEnvelope);
    },
    async save(envelope) {
      await this.saveRecord?.(makeStoredRecord(envelope));
    },
    async loadRecord(pendingRequestId) {
      const value = await transaction<unknown>("readonly", store => store.get(pendingRequestId));
      if (value === undefined) return null;
      const record = decodeStoredRecord(value);
      await validatePendingSubmissionEnvelope(record.envelope);
      return record;
    },
    async loadAllRecords() {
      const value = await transaction<unknown[]>("readonly", store => store.getAll());
      if (!Array.isArray(value)) throw new PendingSubmissionError("IndexedDB returned invalid pending records");
      const records = value.map(decodeStoredRecord);
      await Promise.all(records.map(record => validatePendingSubmissionEnvelope(record.envelope)));
      return records;
    },
    async saveRecord(record) {
      const decoded = await validatePendingSubmissionEnvelope(record.envelope);
      const normalized = makeStoredRecord(decoded, record);
      const database = await open();
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(PENDING_STORE_NAME, "readwrite");
        const store = tx.objectStore(PENDING_STORE_NAME);
        let conflict: PendingSubmissionStorageConflictError | null = null;
        let failure: Error | null = null;
        tx.oncomplete = () => {
          database.close();
          resolve();
        };
        tx.onerror = () => {
          database.close();
          reject(conflict ?? failure ?? tx.error ?? new Error("IndexedDB transaction failed"));
        };
        tx.onabort = () => {
          database.close();
          reject(conflict ?? failure ?? tx.error ?? new Error("IndexedDB transaction aborted"));
        };
        const request = store.getAll();
        request.onsuccess = () => {
          try {
            // Existing records were validated before entering this adapter;
            // decode again inside the same transaction for legacy shape safety.
            const records = request.result;
            if (!Array.isArray(records)) throw new PendingSubmissionError("IndexedDB returned invalid pending records");
            const existing = records.map(value => decodeStoredRecord(value));
            if (existing.some(value => value.pending_request_id !== decoded.pending_request_id)) {
              conflict = new PendingSubmissionStorageConflictError(existing.map(value => recordEnvelope(value)));
              tx.abort();
              return;
            }
            // The check and insert are in one readwrite transaction. IndexedDB
            // serializes competing readwrite transactions on this store.
            store.put(normalized);
          } catch (error) {
            failure = error instanceof Error ? error : new Error("IndexedDB save failed");
            tx.abort();
          }
        };
        request.onerror = () => {
          // The transaction handlers own rejection after request failure.
        };
      });
    },
    async remove(pendingRequestId) {
      await transaction<void>("readwrite", store => store.delete(pendingRequestId));
    },
  };
}

export function createDefaultPendingSubmissionStorage(principalId?: string): PendingSubmissionStorage {
  if (typeof window === "undefined") return createMemoryPendingSubmissionStorage();
  if (principalId === undefined) throw new PendingSubmissionError("A principal is required for browser pending storage");
  if (typeof indexedDB === "undefined") throw new PendingSubmissionError("IndexedDB is unavailable in the browser");
  return createIndexedDbPendingSubmissionStorage(principalId, indexedDB);
}
