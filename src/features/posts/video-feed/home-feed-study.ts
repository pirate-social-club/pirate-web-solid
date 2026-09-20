import type { StudyV2Api } from "../../studying/study-v2-api.ts";

/** The authoritative referenced song for a feed video, or null when unlinked. */
export function linkedSongPostId(item: { readonly songPostId?: string | null }): string | null {
  return typeof item.songPostId === "string" && item.songPostId !== "" ? item.songPostId : null;
}

export type StudyAvailabilityState = "ready" | "unavailable";

/**
 * Deduplicates Study availability reads by song id so a feed page with several
 * videos referencing one song issues one request. Errors resolve unavailable:
 * the action must never appear enabled on an unknown state.
 */
export function createStudyAvailabilityLookup(
  load: (songPostId: string) => Promise<StudyAvailabilityState>,
): (songPostId: string) => Promise<boolean> {
  const cache = new Map<string, Promise<boolean>>();
  return (songPostId) => {
    const cached = cache.get(songPostId);
    if (cached !== undefined) return cached;
    const pending = load(songPostId).then(
      (state) => state === "ready",
      () => false,
    );
    cache.set(songPostId, pending);
    return pending;
  };
}

export function makeStudyAvailabilityLookup(
  api: Pick<StudyV2Api, "loadAvailability">,
): (songPostId: string) => Promise<boolean> {
  return createStudyAvailabilityLookup(async (songPostId) => {
    const loaded = await api.loadAvailability(songPostId);
    return loaded.availability.state === "ready" ? "ready" : "unavailable";
  });
}
