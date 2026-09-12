import { parseStoredExcerptDraft, type SongExcerptDraft, type SongExcerptDraftStore } from "./song-excerpt-draft";

/** A draft store that survives closing the composer.
 *
 * Reopening the video draft has to bring back the same milliseconds, and an
 * in-memory store cannot do that once the dialog unmounts. `localStorage` is
 * enough for one small record and keeps this independent of the video
 * coordinator's IndexedDB, which holds the video file itself.
 *
 * A refused write is reported rather than swallowed. A browser can refuse
 * storage — private mode, a blocked origin, a full quota — and a retain that
 * quietly did nothing would tell someone their excerpt was kept when it was
 * not.
 */
export class SongExcerptDraftUnwritable extends Error {
  constructor() {
    super("This browser wouldn’t store the excerpt, so it hasn’t been kept.");
    this.name = "SongExcerptDraftUnwritable";
  }
}

export function excerptDraftStorageKey(namespace: string): string {
  return `song-excerpt-draft:${namespace}`;
}

export function createLocalExcerptDraftStore(namespace: string): SongExcerptDraftStore {
  const key = excerptDraftStorageKey(namespace);
  return {
    load: async () => {
      // A read that throws, or bytes that are not a draft, both mean there is
      // nothing to restore. Neither is repaired: the parse boundary decides.
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? null : parseStoredExcerptDraft(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    save: async (draft: SongExcerptDraft) => {
      try {
        localStorage.setItem(key, JSON.stringify(draft));
      } catch {
        throw new SongExcerptDraftUnwritable();
      }
    },
  };
}
