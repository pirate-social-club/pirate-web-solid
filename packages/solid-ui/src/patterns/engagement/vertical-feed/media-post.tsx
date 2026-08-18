import { createEffect, Show, untrack } from "solid-js";

import { Type } from "@/components/data-display/type/type";
import { cn } from "@/lib/cn";

import { MediaActions } from "./media-actions";
import type { HapticKind, MediaPostData } from "./types";
import { createVideoPlayback } from "./video-playback";
import { VideoPlayer } from "./video-player";

export interface MediaPostProps extends MediaPostData {
  /** Whether this post is the active (in-view) post. */
  autoplay?: boolean;
  /** Eager loading for the active and adjacent posts. */
  priorityLoad?: boolean;
  /** Lift overlays above a host app's mobile tab bar. */
  hasMobileFooter?: boolean;
  /** Bypass the first-interaction autoplay gate. */
  forceAutoplay?: boolean;
  /** Controlled audio state supplied by the feed host. */
  muted?: boolean;
  /** Hide the shared author/action overlays when a product host owns chrome. */
  showChrome?: boolean;
  class?: string;
  onLikeClick?: () => void;
  onShareClick?: () => void;
  onFollowClick?: () => void;
  onAuthorClick?: () => void;
  onSoundtrackClick?: () => void;
  onMuteToggle?: (muted: boolean) => void;
  onTimeUpdate?: (postId: string, currentTime: number, duration: number) => void;
  /** Called once per post after 3 seconds of cumulative watch time. */
  onViewed?: (postId: string) => void;
  onHaptic?: (kind: HapticKind) => void;
}

const VIEW_THRESHOLD_SECONDS = 3;

/**
 * MediaPost - one full-height feed item. Mobile: full-screen with overlays.
 * Desktop: centered 9:16 card with an action column beside it. Emits events
 * only; navigation, sharing, and notifications belong to the host app.
 * Action controls hide when their callback is absent (except mute); the
 * author and soundtrack overlay lines degrade to plain text when unwired.
 */
export function MediaPost(props: MediaPostProps) {
  // Pass autoplay as a getter so scroll-driven changes stay reactive.
  // forceAutoplay is a construction-time option; read it untracked.
  const playback = createVideoPlayback({
    autoplay: () => props.autoplay ?? true,
    forceAutoplay: untrack(() => props.forceAutoplay),
  });

  createEffect(
    () => props.muted,
    (muted) => {
      if (muted !== undefined && muted !== untrack(playback.isMuted)) {
        playback.setIsMuted(muted);
      }
    },
  );

  // View tracking lives in the timeupdate event handler rather than an
  // effect, so the accumulation locals and the onViewed emit never run in a
  // reactive compute/apply scope.
  let watchTime = 0;
  let lastTime = 0;
  let markedViewed = false;
  let trackedPostId: string | undefined;

  const handleTimeUpdate = (time: number, duration: number) => {
    playback.handleTimeUpdate(time);
    props.onTimeUpdate?.(props.id, time, duration);

    if (props.id !== trackedPostId) {
      watchTime = 0;
      lastTime = 0;
      markedViewed = false;
      trackedPostId = props.id;
    }

    if (markedViewed || !playback.isPlaying()) return;

    // Only count small forward progress (normal playback, not seeks).
    const delta = time - lastTime;
    if (delta > 0 && delta < 1) {
      watchTime += delta;
    }
    lastTime = time;

    if (watchTime >= VIEW_THRESHOLD_SECONDS) {
      markedViewed = true;
      props.onViewed?.(props.id);
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !playback.isMuted();
    playback.handleToggleMute();
    props.onMuteToggle?.(nextMuted);
  };

  const handleTogglePlay = () => {
    const wasMuted = playback.isMuted();
    playback.handleTogglePlay();
    if (wasMuted) {
      props.onMuteToggle?.(false);
    }
  };

  // Bottom insets clear the host app's mobile tab bar when present.
  // Host contract: the host app may define --safe-area-bottom (typically to
  // env(safe-area-inset-bottom) plus any tab-bar offset); it falls back to
  // 0px when the host does not define it.
  const safeAreaBottom = "var(--safe-area-bottom, 0px)";
  const actionsBottomOffset = () =>
    props.hasMobileFooter
      ? `calc(${safeAreaBottom} + 5rem)`
      : `calc(${safeAreaBottom} + 1rem)`;
  const infoBottomOffset = () =>
    props.hasMobileFooter
      ? `calc(${safeAreaBottom} + 4rem)`
      : safeAreaBottom;

  const hasSoundtrack = () => !!(props.title || props.artist);

  return (
    <div
      class={cn(
        "relative flex h-[100dvh] w-full snap-start items-center justify-center bg-background md:h-screen",
        props.class,
      )}
    >
      {/* Video container - responsive sizing */}
      <div class="relative h-full w-full overflow-hidden bg-background md:h-[90vh] md:max-h-[800px] md:w-[50.625vh] md:max-w-[450px] md:rounded-lg">
        <VideoPlayer
          videoUrl={props.videoUrl}
          posterUrl={props.posterUrl}
          isPlaying={playback.isPlaying()}
          isMuted={playback.isMuted()}
          priorityLoad={props.priorityLoad}
          onTogglePlay={handleTogglePlay}
          onPlayFailed={playback.handlePlayFailed}
          onTimeUpdate={handleTimeUpdate}
        />

        {/* Desktop: post info overlay, bottom left inside the video container.
            Author and soundtrack degrade to plain text when unwired. */}
        <Show when={props.showChrome ?? true}>
          <div class="pointer-events-none absolute bottom-4 left-6 right-20 z-40 max-md:hidden">
          <Show
            when={props.onAuthorClick}
            fallback={
              <span class="text-lg font-semibold text-primary-foreground drop-shadow-lg">
                @{props.authorName}
              </span>
            }
          >
            <button
              type="button"
              class="pointer-events-auto cursor-pointer text-lg font-semibold text-primary-foreground drop-shadow-lg hover:underline"
              onClick={() => props.onAuthorClick?.()}
            >
              @{props.authorName}
            </button>
          </Show>
          <Show when={props.caption}>
            <Type as="p" variant="caption" class="mt-1 line-clamp-2 text-primary-foreground/90">
              {props.caption}
            </Type>
          </Show>
          <Show when={hasSoundtrack()}>
            <Show
              when={props.onSoundtrackClick}
              fallback={
                <Type as="span" variant="caption" class="mt-1 block text-primary-foreground/70">
                  {props.title}
                  {props.title && props.artist ? " - " : ""}
                  {props.artist}
                </Type>
              }
            >
              <button
                type="button"
                class="pointer-events-auto mt-1 block cursor-pointer hover:underline"
                onClick={() => props.onSoundtrackClick?.()}
              >
                <Type as="span" variant="caption" class="text-primary-foreground/70">
                  {props.title}
                  {props.title && props.artist ? " - " : ""}
                  {props.artist}
                </Type>
              </button>
            </Show>
          </Show>
          </div>
        </Show>
      </div>

      <Show when={props.showChrome ?? true}>
        {/* Mobile: post info, absolute positioned outside the container */}
        <div
          class="pointer-events-none absolute left-0 right-0 z-40 p-6 pr-20 md:hidden"
          style={{ bottom: infoBottomOffset() }}
        >
        <Show
          when={props.onAuthorClick}
          fallback={
            <span class="text-lg font-semibold text-primary-foreground drop-shadow-lg">
              @{props.authorName}
            </span>
          }
        >
          <button
            type="button"
            class="pointer-events-auto cursor-pointer text-lg font-semibold text-primary-foreground drop-shadow-lg hover:underline"
            onClick={() => props.onAuthorClick?.()}
          >
            @{props.authorName}
          </button>
        </Show>
        <Show when={props.caption}>
          <Type as="p" variant="caption" class="mt-1 line-clamp-2 text-primary-foreground/90 drop-shadow-md">
            {props.caption}
          </Type>
        </Show>
        <Show when={hasSoundtrack()}>
          <Show
            when={props.onSoundtrackClick}
            fallback={
              <Type as="span" variant="caption" class="mt-1 block text-primary-foreground/70">
                {props.title}
                {props.title && props.artist ? " - " : ""}
                {props.artist}
              </Type>
            }
          >
            <button
              type="button"
              class="pointer-events-auto mt-1 block cursor-pointer hover:underline"
              onClick={() => props.onSoundtrackClick?.()}
            >
              <Type as="span" variant="caption" class="text-primary-foreground/70">
                {props.title}
                {props.title && props.artist ? " - " : ""}
                {props.artist}
              </Type>
            </button>
          </Show>
        </Show>
        </div>

        {/* Mobile: actions overlay on the right side */}
        <div
          class="absolute right-4 z-40 md:hidden"
          style={{ bottom: actionsBottomOffset() }}
        >
        <MediaActions
          authorName={props.authorName}
          authorAvatarUrl={props.authorAvatarUrl}
          isFollowing={props.isFollowing}
          isLiked={props.isLiked ?? false}
          likeCount={props.likeCount}
          isMuted={playback.isMuted()}
          title={props.title}
          artist={props.artist}
          mediaImageUrl={props.mediaImageUrl}
          onAuthorClick={props.onAuthorClick}
          onFollowClick={props.onFollowClick}
          onLikeClick={props.onLikeClick}
          onShareClick={props.onShareClick}
          onSoundtrackClick={props.onSoundtrackClick}
          onToggleMute={handleToggleMute}
          onHaptic={props.onHaptic}
        />
        </div>

        {/* Desktop: actions column to the right of the video */}
        <div class="absolute left-[calc(50%+25vh+20px)] top-1/2 z-40 -translate-y-1/2 max-md:hidden">
        <MediaActions
          authorName={props.authorName}
          authorAvatarUrl={props.authorAvatarUrl}
          isFollowing={props.isFollowing}
          isLiked={props.isLiked ?? false}
          likeCount={props.likeCount}
          isMuted={playback.isMuted()}
          title={props.title}
          artist={props.artist}
          mediaImageUrl={props.mediaImageUrl}
          onAuthorClick={props.onAuthorClick}
          onFollowClick={props.onFollowClick}
          onLikeClick={props.onLikeClick}
          onShareClick={props.onShareClick}
          onSoundtrackClick={props.onSoundtrackClick}
          onToggleMute={handleToggleMute}
          onHaptic={props.onHaptic}
        />
        </div>
      </Show>
    </div>
  );
}
