import { createEffect, createSignal, Show } from "solid-js";

import { Spinner } from "@/components/feedback/spinner/spinner";
import { IconPlay } from "@/components/media/icons";
import { Type } from "@/components/data-display/type/type";
import { cn } from "@/lib/cn";

import type { VideoPlayerProps } from "./types";

/**
 * VideoPlayer - video surface with a play/pause toggle, poster, loading, and
 * error states. Stateless about playback policy: the owner drives isPlaying
 * and isMuted, this component syncs them into the media element.
 */
export function VideoPlayer(props: VideoPlayerProps) {
  let videoRef: HTMLVideoElement | undefined;

  const [isLoaded, setIsLoaded] = createSignal(false);
  const [hasStartedPlaying, setHasStartedPlaying] = createSignal(false);
  // ownedWrite: both are written from effect apply phases below.
  const [isLoading, setIsLoading] = createSignal(false, { ownedWrite: true });
  const [error, setError] = createSignal<string | null>(null, {
    ownedWrite: true,
  });

  // Play/pause directly in the click handler for autoplay-policy compliance.
  const handlePlayPause = () => {
    const el = videoRef;
    if (!el || !props.videoUrl) return;

    if (el.paused) {
      el.play().catch((e: DOMException) => {
        if (e.name === "NotAllowedError") props.onPlayFailed?.();
      });
    } else {
      el.pause();
    }

    props.onTogglePlay();
  };

  // (Re)load the element when the source URL changes.
  createEffect(
    () => props.videoUrl,
    (url) => {
      const el = videoRef;
      if (!url || !el) return;
      setIsLoading(true);
      setError(null);
      el.src = url;
      el.load();
    },
  );

  // Sync the requested play state into the media element.
  createEffect(
    () => ({ playing: props.isPlaying, loaded: isLoaded() }),
    ({ playing, loaded }) => {
      const el = videoRef;
      if (!el || !loaded) return;
      if (playing && el.paused) {
        el.play().catch((e: DOMException) => {
          if (e.name === "NotAllowedError") props.onPlayFailed?.();
        });
      } else if (!playing && !el.paused) {
        el.pause();
      }
    },
  );

  // Keep the element's muted property in sync (property, not attribute, so
  // SSR markup never hard-locks the muted state).
  createEffect(
    () => props.isMuted,
    (muted) => {
      if (videoRef) videoRef.muted = muted;
    },
  );

  const showSpinner = () =>
    isLoading() &&
    (props.isPlaying || hasStartedPlaying()) &&
    !props.posterUrl;

  return (
    <div class={cn("relative h-full w-full bg-black", props.class)}>
      <Show when={props.posterUrl}>
        {(posterUrl) => (
          <img
            src={posterUrl()}
            alt=""
            class="absolute inset-0 z-10 h-full w-full object-cover"
            loading={props.priorityLoad ? "eager" : "lazy"}
          />
        )}
      </Show>

      <Show when={props.videoUrl}>
        <video
          ref={(el) => {
            videoRef = el;
          }}
          class={cn(
            "absolute inset-0 h-full w-full object-cover",
            hasStartedPlaying() ? "z-20" : "z-0",
          )}
          loop
          playsinline
          preload={props.priorityLoad ? "auto" : "metadata"}
          tabindex={-1}
          onLoadedMetadata={() => {
            setIsLoaded(true);
            setIsLoading(false);
          }}
          onPlaying={() => setHasStartedPlaying(true)}
          onError={() => {
            const mediaError = videoRef?.error;
            setError(
              mediaError
                ? `Code ${mediaError.code}: ${mediaError.message || "Unknown error"}`
                : "Unknown error",
            );
            setIsLoading(false);
          }}
          onTimeUpdate={() => {
            if (videoRef) {
              props.onTimeUpdate?.(videoRef.currentTime, videoRef.duration);
            }
          }}
        />
      </Show>

      <Show when={!props.videoUrl && !props.posterUrl}>
        <div class="absolute inset-0 z-0 flex h-full w-full items-center justify-center bg-background">
          <span class="text-muted-foreground">No media</span>
        </div>
      </Show>

      {/* Play/pause toggle: covers the surface and stays keyboard accessible. */}
      <Show when={props.videoUrl}>
        <button
          type="button"
          aria-label={props.isPlaying ? "Pause video" : "Play video"}
          class={cn(
            "group absolute inset-0 z-30 flex cursor-pointer items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white",
            props.isPlaying ? "bg-transparent" : "bg-black/20 hover:bg-black/30",
          )}
          onClick={(event) => {
            event.stopPropagation();
            handlePlayPause();
          }}
        >
          <Show when={!props.isPlaying}>
            <span class="flex size-20 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition-colors group-hover:bg-black/50">
              <IconPlay class="ml-1 size-10 text-white" />
            </span>
          </Show>
        </button>
      </Show>

      <Show when={showSpinner()}>
        <div class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <Spinner size="lg" class="size-16 text-white" decorative />
        </div>
      </Show>

      <Show when={error()}>
        {(message) => (
          <div class="absolute inset-0 z-40 flex items-center justify-center bg-black/80">
            <div class="p-4 text-center text-white">
              <p class="font-semibold">Playback error</p>
              <Type as="p" variant="caption" class="mt-2 text-primary-foreground">
                {message()}
              </Type>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
