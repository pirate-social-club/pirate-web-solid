import type { StudyV2Api } from "../../studying/study-v2-api.ts";

/** The authoritative referenced song for a feed video, or null when unlinked. */
export function linkedSongPostId(item: { readonly songPostId?: string | null }): string | null {
  return typeof item.songPostId === "string" && item.songPostId !== "" ? item.songPostId : null;
}

export type StudyAvailabilityState = "ready" | "unavailable";

export interface StudyAvailabilityLookupOptions {
  readonly now?: () => number;
  /** How long a ready answer is trusted before a fresh read. */
  readonly readyTtlMs?: number;
  /**
   * How long an unavailable or failed answer is remembered. A short bound is
   * what lets a transient failure or an anonymous read recover.
   */
  readonly failureTtlMs?: number;
  /** Bound on remembered songs per scope. */
  readonly maxEntries?: number;
}

export interface StudyAvailabilityLookup {
  /**
   * Deduplicated availability read for one song within one viewer scope.
   * Concurrent calls for the same song share one request; changing the scope
   * clears every answer and in-flight read from the previous scope.
   */
  (songPostId: string, scope: string): Promise<boolean>;
  /** Drop every cached answer and in-flight read. */
  reset(): void;
}

const DEFAULT_READY_TTL_MS = 60_000;
const DEFAULT_FAILURE_TTL_MS = 10_000;
const DEFAULT_MAX_ENTRIES = 64;

interface CacheEntry {
  promise: Promise<boolean>;
  readonly expiresAt: number;
  readonly settled: boolean;
}

/**
 * Deduplicates Study availability reads per song for one viewer scope. Errors
 * resolve unavailable: the action must never appear enabled on an unknown
 * state. Answers are bounded in time and scoped to the viewer, so a failure
 * retries, an anonymous read does not survive sign-in, and an earlier ready
 * answer cannot cross into another account.
 */
export function createStudyAvailabilityLookup(
  load: (songPostId: string) => Promise<StudyAvailabilityState>,
  options: StudyAvailabilityLookupOptions = {},
): StudyAvailabilityLookup {
  const now = options.now ?? Date.now;
  const readyTtlMs = options.readyTtlMs ?? DEFAULT_READY_TTL_MS;
  const failureTtlMs = options.failureTtlMs ?? DEFAULT_FAILURE_TTL_MS;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  let scope: string | null = null;
  let generation = 0;
  let cache = new Map<string, CacheEntry>();

  const remember = (songPostId: string, entry: CacheEntry): void => {
    cache.set(songPostId, entry);
    if (cache.size <= maxEntries) return;
    const at = now();
    for (const [key, candidate] of cache) if (candidate.settled && candidate.expiresAt <= at) cache.delete(key);
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  };

  const lookup = (songPostId: string, nextScope: string): Promise<boolean> => {
    if (nextScope !== scope) {
      scope = nextScope;
      generation += 1;
      cache = new Map();
    }
    const at = now();
    const cached = cache.get(songPostId);
    // An in-flight entry carries a short freshness bound too, so a hung read
    // cannot deduplicate forever.
    if (cached !== undefined && cached.expiresAt > at) return cached.promise;
    if (cached !== undefined) cache.delete(songPostId);

    const requestGeneration = generation;
    const entry: CacheEntry = {
      promise: Promise.resolve(false),
      expiresAt: at + failureTtlMs,
      settled: false,
    };
    const pending = load(songPostId).then(
      (state) => {
        const ready = state === "ready";
        if (requestGeneration === generation && cache.get(songPostId) === entry) {
          remember(songPostId, {
            promise: Promise.resolve(ready),
            expiresAt: now() + (ready ? readyTtlMs : failureTtlMs),
            settled: true,
          });
        }
        return ready;
      },
      () => {
        if (requestGeneration === generation && cache.get(songPostId) === entry) {
          remember(songPostId, {
            promise: Promise.resolve(false),
            expiresAt: now() + failureTtlMs,
            settled: true,
          });
        }
        return false;
      },
    );
    // Keep the shared promise on the entry so concurrent callers reuse it.
    entry.promise = pending;
    cache.set(songPostId, entry);
    return pending;
  };
  lookup.reset = () => {
    generation += 1;
    cache = new Map();
  };
  return lookup;
}

export function makeStudyAvailabilityLookup(
  api: Pick<StudyV2Api, "loadAvailability">,
  options: StudyAvailabilityLookupOptions = {},
): StudyAvailabilityLookup {
  return createStudyAvailabilityLookup(async (songPostId) => {
    const loaded = await api.loadAvailability(songPostId);
    return loaded.availability.state === "ready" ? "ready" : "unavailable";
  }, options);
}
