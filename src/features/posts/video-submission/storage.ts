import { isRetainedVersion, type PendingVideo, type VideoStorage } from "./coordinator";
import { VideoContractError } from "./contracts";

/** A retained song selection, checked field by field; anything else is not one. */
function songSelection(value: object): PendingVideo["song"] {
  if (!("songPostId" in value) || !("audioRevision" in value) || !("clipStartSamples" in value)
    || !("clipDurationSamples" in value) || !("selectedFrom" in value)) return undefined;
  const { songPostId, audioRevision, clipStartSamples, clipDurationSamples, selectedFrom } = value;
  if (typeof songPostId !== "string" || songPostId === "" || typeof audioRevision !== "number"
    || typeof clipStartSamples !== "number" || typeof clipDurationSamples !== "number"
    || !Number.isSafeInteger(audioRevision) || audioRevision < 1
    || !Number.isSafeInteger(clipStartSamples) || clipStartSamples < 0
    || !Number.isSafeInteger(clipDurationSamples) || clipDurationSamples < 1
    || typeof selectedFrom !== "object" || selectedFrom === null || !("kind" in selectedFrom)) return undefined;
  if (selectedFrom.kind === "library") {
    return { songPostId, audioRevision, clipStartSamples, clipDurationSamples, selectedFrom: { kind: "library" } };
  }
  if (selectedFrom.kind === "feed" && "origin_post_id" in selectedFrom && typeof selectedFrom.origin_post_id === "string") {
    return { songPostId, audioRevision, clipStartSamples, clipDurationSamples,
      selectedFrom: { kind: "feed", origin_post_id: selectedFrom.origin_post_id } };
  }
  return undefined;
}

/** Account-scoped IndexedDB; never a bearer token or an authentication source. */
export function createBrowserVideoStorage(principalId: string): VideoStorage {
  if (!principalId.trim()) throw new VideoContractError("An authenticated account is required");
  const databaseName = `pirate-original-video-v1:${encodeURIComponent(principalId)}`;
  const connect = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new VideoContractError("Durable video storage is unavailable")); return; }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("attempt"); };
    request.onerror = () => reject(request.error ?? new VideoContractError("Video storage could not open"));
    request.onblocked = () => reject(new VideoContractError("Another tab is blocking video storage"));
    request.onsuccess = () => resolve(request.result);
  });
  async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await connect();
    try {
      return await new Promise<T>((resolve, reject) => {
        const transaction = database.transaction("attempt", mode);
        const request = operation(transaction.objectStore("attempt"));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error ?? new VideoContractError("Video storage transaction failed"));
        transaction.onerror = () => reject(transaction.error ?? new VideoContractError("Video storage transaction failed"));
      });
    } finally { database.close(); }
  }
  return {
    async exclusive(work) {
      if (typeof navigator === "undefined" || !navigator.locks) {
        throw new VideoContractError("This browser cannot safely coordinate retained video uploads");
      }
      return navigator.locks.request(databaseName, { mode: "exclusive", ifAvailable: true }, lock => {
        if (!lock) throw new VideoContractError("Another tab is handling this video; continue there or close it first");
        return work();
      });
    },
    async load() {
      const value: unknown = await transact("readonly", store => store.get("current"));
      if (value === undefined) return null;
      if (typeof value !== "object" || value === null || !("version" in value)
        || (value.version !== "original-video-pending-v1" && value.version !== "song-video-pending-v1")
        || !isRetainedVersion({ version: value.version,
          song: "song" in value && typeof value.song === "object" && value.song !== null ? songSelection(value.song) : undefined })
        || !("principalId" in value)
        || value.principalId !== principalId || !("file" in value) || !(value.file instanceof Blob)
        || !("receipts" in value) || !Array.isArray(value.receipts)
        || !("communityId" in value) || typeof value.communityId !== "string"
        || !("personaId" in value) || typeof value.personaId !== "string"
        || !("caption" in value) || typeof value.caption !== "string"
        || !("rating" in value) || (value.rating !== "general" && value.rating !== "adult_18")
        || !("pending" in value) || !("reservation" in value) || !("snapshot" in value)) {
        throw new VideoContractError("Saved video data could not be restored safely");
      }
      // SAFETY: This versioned store is written only with PendingVideo values;
      // account, blob and envelope fields are checked above. Retained commands
      // are digest-checked before replay; multipart receipts are checked before PUT.
      return value as PendingVideo;
    },
    async save(record) { await transact("readwrite", store => store.put(record, "current")); },
    async remove() { await transact("readwrite", store => store.delete("current")); },
  };
}
