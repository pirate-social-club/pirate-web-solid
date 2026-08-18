import {
  createComponent,
  createContext,
  createEffect,
  createSignal,
  untrack,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js";

/**
 * Shared video-playback gate for the VerticalFeed pattern.
 *
 * Browsers block autoplay with sound until the first user interaction, so the
 * feed tracks a single "user has interacted" fact for the whole feed. The
 * context is Solid 2 style: default-less, provided explicitly. The provider
 * is written with `createComponent` so this module stays JSX-free and
 * SSR-safe (no browser APIs at module scope).
 */

interface VideoPlaybackContextValue {
  /** True once the user has interacted with any player under this provider. */
  hasUserInteracted: Accessor<boolean>;
  /** Record a user interaction (unlocks autoplay for the rest of the session). */
  markUserInteracted: () => void;
}

const VideoPlaybackContext = createContext<VideoPlaybackContextValue>();

export function VideoPlaybackProvider(props: ParentProps) {
  const [hasUserInteracted, setHasUserInteracted] = createSignal(false);

  return createComponent(VideoPlaybackContext, {
    value: {
      hasUserInteracted,
      markUserInteracted: () => {
        if (!hasUserInteracted()) setHasUserInteracted(true);
      },
    },
    get children() {
      return props.children;
    },
  });
}

export interface CreateVideoPlaybackOptions {
  /**
   * Reactive autoplay input. Pass a getter so scroll-driven changes track:
   * `createVideoPlayback({ autoplay: () => props.autoplay })`.
   */
  autoplay?: Accessor<boolean>;
  /** Bypass the first-interaction gate (e.g. muted preview surfaces). */
  forceAutoplay?: boolean;
}

export interface CreateVideoPlaybackReturn {
  isPlaying: Accessor<boolean>;
  isMuted: Accessor<boolean>;
  currentTime: Accessor<number>;
  setIsPlaying: (playing: boolean) => void;
  setIsMuted: (muted: boolean) => void;
  handleTogglePlay: () => void;
  handleToggleMute: () => void;
  handlePlayFailed: () => void;
  handleTimeUpdate: (time: number) => void;
}

/**
 * Playback state for one post. Standalone use (no VideoPlaybackProvider)
 * falls back to a per-hook interaction gate.
 */
export function createVideoPlayback(
  options: CreateVideoPlaybackOptions = {},
): CreateVideoPlaybackReturn {
  const context = useContext(VideoPlaybackContext);
  const [localInteracted, setLocalInteracted] = createSignal(false);
  const hasUserInteracted = () =>
    context ? context.hasUserInteracted() : localInteracted();
  const markUserInteracted = () => {
    if (context) context.markUserInteracted();
    else setLocalInteracted(true);
  };

  // ownedWrite: the autoplay sync below writes isPlaying from an effect
  // apply phase, which Solid 2 otherwise rejects for owned scopes.
  const [isPlaying, setIsPlaying] = createSignal(false, { ownedWrite: true });
  // ownedWrite: MediaPost may synchronize a controlled host mute value from
  // an effect apply phase, while direct user toggles still write normally.
  const [isMuted, setIsMuted] = createSignal(false, { ownedWrite: true });
  const [currentTime, setCurrentTime] = createSignal(0);

  const autoplay = options.autoplay ?? (() => true);

  // Sync play state with the autoplay input (i.e. scroll position). The
  // compute phase tracks only autoplay; the apply phase reads the
  // interaction gate untracked, so a first interaction never restarts or
  // pauses playback on its own and manual toggles win between scrolls.
  createEffect(
    () => autoplay(),
    (shouldAutoplay) => {
      // Deliberately untracked: the gate is read, never subscribed to.
      if (shouldAutoplay && (options.forceAutoplay || untrack(hasUserInteracted))) {
        setIsPlaying(true);
      } else if (!shouldAutoplay) {
        setIsPlaying(false);
      }
    },
  );

  const handleTogglePlay = () => {
    markUserInteracted();

    // If playing but muted, unmute instead of pausing.
    if (isPlaying() && isMuted()) {
      setIsMuted(false);
      return;
    }

    const nextPlaying = !isPlaying();
    setIsPlaying(nextPlaying);

    // Unmute when starting to play.
    if (nextPlaying && isMuted()) {
      setIsMuted(false);
    }
  };

  const handleToggleMute = () => {
    markUserInteracted();
    setIsMuted(!isMuted());
  };

  const handlePlayFailed = () => {
    setIsPlaying(false);
  };

  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time);
  };

  return {
    isPlaying,
    isMuted,
    currentTime,
    setIsPlaying,
    setIsMuted,
    handleTogglePlay,
    handleToggleMute,
    handlePlayFailed,
    handleTimeUpdate,
  };
}
