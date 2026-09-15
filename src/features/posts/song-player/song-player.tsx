import { Show, createSignal, onCleanup } from "solid-js";
import { Button, IconPlay, Type } from "../../../design-system.ts";
import { readSongPlaybackAccess, type SongPlaybackGrant } from "./song-player-api.ts";

type PlayerGrant = Omit<SongPlaybackGrant, "expires_at" | "renew_after"> & {
  readonly expires_at: number;
  readonly renew_after: number;
};

/**
 * Playback grants are reusable bearer URLs valid for fifteen minutes, and a
 * community feed can replace its post components while a grant request is in
 * flight. Cache the latest grant per post so a remounted player resumes from
 * it instead of discarding access and refetching.
 */
const playbackGrants = new Map<string, PlayerGrant>();
const playbackGrantListeners = new Map<string, Set<(grant: PlayerGrant) => void>>();
const PLAYBACK_GRANT_CACHE_LIMIT = 32;

function cachePlaybackGrant(postId: string, grant: PlayerGrant): void {
  playbackGrants.delete(postId);
  playbackGrants.set(postId, grant);
  while (playbackGrants.size > PLAYBACK_GRANT_CACHE_LIMIT) {
    const oldest = playbackGrants.keys().next().value;
    if (oldest === undefined) break;
    playbackGrants.delete(oldest);
  }
  // A request started by a component that has since been replaced still has
  // to reach its successor, which subscribed before the grant resolved.
  for (const listener of playbackGrantListeners.get(postId) ?? []) listener(grant);
}

function subscribePlaybackGrant(
  postId: string,
  listener: (grant: PlayerGrant) => void,
): () => void {
  const listeners = playbackGrantListeners.get(postId) ?? new Set<(grant: PlayerGrant) => void>();
  listeners.add(listener);
  playbackGrantListeners.set(postId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) playbackGrantListeners.delete(postId);
  };
}

function cachedPlaybackGrant(postId: string, nowSeconds: number): PlayerGrant | undefined {
  const cached = playbackGrants.get(postId);
  return cached !== undefined && cached.renew_after > nowSeconds ? cached : undefined;
}

export interface SongPlayerProps {
  readonly postId: string;
  readonly title: string;
  readonly readAccess?: (postId: string) => Promise<SongPlaybackGrant>;
  readonly now?: () => number;
  /**
   * Compact mode joins the caller's flex row: the trigger stays on the line
   * and the granted native audio wraps to its own full-width line beneath it.
   */
  readonly compact?: boolean;
}
/** Native controls provide seeking, volume and keyboard access to the real full mix. */
export function SongPlayer(props: SongPlayerProps) {
  let audio: HTMLAudioElement | undefined;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resumeAt = 0;
  let shouldResume = false;
  const [busy, setBusy] = createSignal(false);
  const [issue, setIssue] = createSignal<string>();
  const now = () => Math.floor((props.now?.() ?? Date.now()) / 1000);
  const [grant, setGrant] = createSignal<PlayerGrant | undefined>(
    cachedPlaybackGrant(props.postId, now()),
  );
  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  onCleanup(() => {
    disposed = true;
    clearTimer();
    audio?.pause();
    audio?.removeAttribute("src");
    audio?.load();
  });
  onCleanup(subscribePlaybackGrant(props.postId, next => {
    if (!disposed) setGrant(next);
  }));
  const renew = async (start: boolean): Promise<void> => {
    if (busy() || disposed) return;
    clearTimer();
    setIssue(undefined);
    const cached = cachedPlaybackGrant(props.postId, now());
    if (cached !== undefined) {
      // A still-valid grant must not pause playback on a retry. Reuse the
      // element, or let the freshly rendered one resume on metadata.
      resumeAt = audio?.currentTime ?? 0;
      shouldResume = start;
      if (grant() !== cached) setGrant(cached);
      if (start && audio !== undefined && audio.readyState > 0) {
        shouldResume = false;
        void audio.play().catch(() => {
          if (!disposed) setIssue("Press play to start the song.");
        });
      }
      return;
    }
    setBusy(true);
    resumeAt = audio?.currentTime ?? 0;
    shouldResume = start;
    audio?.pause();
    try {
      const response = await (props.readAccess ?? readSongPlaybackAccess)(props.postId);
      const next: PlayerGrant = {
        ...response,
        expires_at: Number(response.expires_at),
        renew_after: Number(response.renew_after),
      };
      const url = new URL(next.playback_url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !Number.isFinite(next.expires_at) ||
        !Number.isFinite(next.renew_after) ||
        next.renew_after <= now() ||
        next.expires_at <= next.renew_after
      )
        throw new Error("Invalid playback grant");
      // Cache before the disposal check so a replaced component still leaves
      // reusable access for the one that follows it.
      cachePlaybackGrant(props.postId, next);
      if (disposed) return;
      setGrant(next);
    } catch {
      if (!disposed) {
        setGrant(undefined);
        setIssue("This song could not be played. Try again.");
      }
    } finally {
      if (!disposed) setBusy(false);
    }
  };
  const schedule = () => {
    clearTimer();
    const current = grant();
    if (!current || disposed) return;
    if (now() >= current.renew_after) {
      void renew(true);
      return;
    }
    timer = setTimeout(
      () => {
        if (audio && !audio.paused) void renew(true);
      },
      Math.max(1, (current.renew_after - now()) * 1000),
    );
  };
  const ready = () => {
    if (!audio || disposed) return;
    if (Number.isFinite(audio.duration))
      audio.currentTime = Math.min(resumeAt, Math.max(0, audio.duration));
    if (shouldResume) {
      shouldResume = false;
      void audio.play().catch(() => {
        if (!disposed) setIssue("Press play to start the song.");
      });
    }
  };
  return (
    <div class={props.compact ? "contents" : "flex flex-col gap-2"} data-song-player={props.postId}>
      <Show
        when={grant()}
        fallback={
          <Button
            aria-label={`Play ${props.title}`}
            class={props.compact ? "ml-auto size-9 shrink-0 rounded-full px-0" : undefined}
            disabled={busy()}
            loading={props.compact ? busy() : undefined}
            onClick={() => void renew(true)}
            size="sm"
            type="button"
            variant="secondary"
          >
            {props.compact
              ? (busy() ? undefined : <IconPlay aria-hidden="true" class="size-4" />)
              : busy() ? "Loading audio…" : `Play ${props.title}`}
          </Button>
        }
      >
        {(current) => (
          <audio
            aria-label={`Audio for ${props.title}`}
            class={props.compact ? "w-full basis-full" : "w-full"}
            controls
            preload="metadata"
            ref={audio}
            src={current().playback_url}
            onLoadedMetadata={ready}
            onPlay={schedule}
            onPause={clearTimer}
            onEnded={clearTimer}
            onError={() => {
              clearTimer();
              setIssue("Audio could not be loaded. Retry playback.");
            }}
          />
        )}
      </Show>
      <Show when={issue()}>
        {(message) => (
          <Type class={props.compact ? "basis-full" : undefined} role="status" variant="caption">
            {message()}
          </Type>
        )}
      </Show>
      <Show when={issue() && grant()}>
        <Button
          class={props.compact ? "basis-full" : undefined}
          disabled={busy()}
          onClick={() => void renew(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          Retry playback
        </Button>
      </Show>
    </div>
  );
}
