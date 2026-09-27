import { createEffect, createSignal, onCleanup, untrack, type Accessor } from "solid-js";
import type { ApplicationSessionState } from "../shell/application-session.tsx";
import type { LibrarySong } from "./your-songs-page.tsx";

export interface SongLibrarySource {
  list: (personaId: string, cursor?: string) => Promise<{ songs: readonly LibrarySong[]; nextCursor: string | null }>;
  trending: () => Promise<readonly LibrarySong[]>;
}

/** Keeps account-private results fenced across persona changes and sign-out. */
export function createYourSongs(
  account: Accessor<ApplicationSessionState>,
  personaId: Accessor<string | undefined>,
  source: SongLibrarySource,
) {
  const key = () => { const value = account(); return typeof value === "object" && personaId() ? JSON.stringify([value.userId, personaId()]) : undefined; };
  const [owner, setOwner] = createSignal<string>();
  const [songs, setSongs] = createSignal<readonly LibrarySong[]>([]);
  const [cursor, setCursor] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const [trending, setTrending] = createSignal<readonly LibrarySong[]>([]);
  const [trendingState, setTrendingState] = createSignal<"ready" | "loading" | "unavailable">("loading");
  let generation = 0;
  let trendGeneration = 0;
  let active = true;
  const load = (more = false) => {
    const current = untrack(key);
    const persona = untrack(personaId);
    const next = more ? cursor() : undefined;
    if (more && (loading() || !next)) return;
    const request = ++generation;
    if (!more) { setSongs([]); setCursor(null); setOwner(current); }
    setFailed(false);
    setLoading(current !== undefined);
    if (!current || !persona) return;
    void source.list(persona, next ?? undefined).then(result => {
      if (!active || request !== generation || current !== key()) return;
      setSongs(previous => more ? [...new Map([...previous, ...result.songs].map(song => [song.id, song])).values()] : result.songs);
      setCursor(result.nextCursor);
    }).catch(() => {
      if (active && request === generation && current === key()) setFailed(true);
    }).finally(() => {
      if (active && request === generation) setLoading(false);
    });
  };
  const loadTrending = () => {
    const request = ++trendGeneration;
    setTrendingState("loading");
    void source.trending().then(result => {
      if (active && request === trendGeneration) { setTrending(result); setTrendingState("ready"); }
    }).catch(() => {
      if (active && request === trendGeneration) setTrendingState("unavailable");
    });
  };
  createEffect(key, () => load());
  createEffect(() => true, loadTrending);
  onCleanup(() => { active = false; generation++; trendGeneration++; });
  return {
    songs: () => owner() === key() ? songs() : [],
    hasMore: () => owner() === key() && cursor() !== null,
    loading, failed, trending, trendingState,
    reload: () => load(), loadMore: () => load(true), reloadTrending: loadTrending,
  };
}
