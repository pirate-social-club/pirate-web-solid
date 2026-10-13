import { createEffect, Show, untrack } from "solid-js";

import { Type } from "@/components/data-display/type/type";
import { cn } from "@/lib/cn";

import { MediaActions } from "./media-actions";
import { MediaMore } from "./media-more";
import type {
  HapticKind,
  MediaActivityAction,
  MediaMoreAction,
  MediaPostData,
  VideoSourceAttacher,
} from "./types";
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
  /** Host-attached source for posts without a direct videoUrl. */
  attachVideo?: VideoSourceAttacher;
  /** Hide the shared author/action overlays when a product host owns chrome. */
  showChrome?: boolean;
  class?: string;
  onLikeClick?: () => void;
  onShareClick?: () => void;
  onFollowClick?: () => void;
  onAuthorClick?: () => void;
  onSoundtrackClick?: () => void;
  /** Host-offered activities for this post's rail. */
  activities?: readonly MediaActivityAction[];
  onActivityClick?: (activityId: string) => void;
  /**
   * Host rows for the More menu, after the built-in Mute/Unmute row
   * (e.g. Report, offered by the host only when the viewer may report).
   */
  moreActions?: readonly MediaMoreAction[];
  /**
   * Place the phone More button below the host's header when the header owns
   * the top right (e.g. a Sign in action). Mute/Unmute stays reachable. The
   * desktop More button is unaffected.
   */
  mobileMoreBelowHeader?: boolean;
  onMuteToggle?: (muted: boolean) => void;
  onTimeUpdate?: (postId: string, currentTime: number, duration: number) => void;
  /** Called once per post after 3 seconds of cumulative watch time. */
  onViewed?: (postId: string) => void;
  onHaptic?: (kind: HapticKind) => void;
}

const VIEW_THRESHOLD_SECONDS = 3;

/**
 * MediaPost - one full-height feed item. Mobile: full-screen with overlays.
 * Desktop: centered 9:16 card with an action column beside it, laid out as
 * one centred row. Emits events only; navigation, sharing, and notifications
 * belong to the host app. Rail actions hide when their callback is absent;
 * the author and soundtrack overlay lines degrade to plain text when unwired.
 * A More button (three dots, top right of the video) always offers
 * Mute/Unmute, followed by any host-supplied actions.
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

  const rail = () => (
    <MediaActions
      authorName={props.authorName}
      authorAvatarUrl={props.authorAvatarUrl}
      isFollowing={props.isFollowing}
      isLiked={props.isLiked ?? false}
      likeCount={props.likeCount}
      title={props.title}
      artist={props.artist}
      mediaImageUrl={props.mediaImageUrl}
      onAuthorClick={props.onAuthorClick}
      onFollowClick={props.onFollowClick}
      onLikeClick={props.onLikeClick}
      onShareClick={props.onShareClick}
      onSoundtrackClick={props.onSoundtrackClick}
      activities={props.activities}
      onActivityClick={props.onActivityClick}
      onHaptic={props.onHaptic}
    />
  );

  // Author, caption and soundtrack line. The desktop copy sits inside the
  // card; the phone copy clears the host's tab bar. Author and soundtrack
  // degrade to plain text when unwired.
  const info = () => (
    <>
      <Show
        when={props.onAuthorClick}
        fallback={
          <span class="text-lg font-semibold text-primary-foreground">
            @{props.authorName}
          </span>
        }
      >
        <button
          type="button"
          class="pointer-events-auto cursor-pointer text-lg font-semibold text-primary-foreground hover:underline"
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
            class="pointer-events-auto mt-1 block cursor-pointer leading-5 hover:underline"
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
    </>
  );

  return (
    <div
      class={cn(
        "relative flex h-[100dvh] w-full snap-start items-center justify-center bg-background md:h-screen md:gap-5",
        props.class,
      )}
      data-media-post={props.id}
    >
      {/* Video container: full-bleed on phone, a 9:16 card on desktop */}
      <div class="relative h-full w-full overflow-hidden bg-background md:h-[90vh] md:max-h-[800px] md:w-[50.625vh] md:max-w-[450px] md:shrink-0 md:rounded-lg">
        <VideoPlayer
          videoUrl={props.videoUrl}
          attachVideo={props.attachVideo}
          posterUrl={props.posterUrl}
          isPlaying={playback.isPlaying()}
          isMuted={playback.isMuted()}
          priorityLoad={props.priorityLoad}
          onTogglePlay={handleTogglePlay}
          onPlayFailed={playback.handlePlayFailed}
          onTimeUpdate={handleTimeUpdate}
        />

        <Show when={props.showChrome ?? true}>
          {/* Desktop: post info, bottom left inside the card */}
          <div class="pointer-events-none absolute bottom-4 left-6 right-20 z-40 max-md:hidden">
            {info()}
          </div>

          {/* More (three dots): Mute/Unmute plus host actions. Boost is not
              offered: there is no boost contract for posts yet. */}
          <MediaMore
            isMuted={playback.isMuted()}
            onToggleMute={handleToggleMute}
            actions={props.moreActions}
            belowHeader={props.mobileMoreBelowHeader}
          />
        </Show>
      </div>

      <Show when={props.showChrome ?? true}>
        {/* Desktop: action rail beside the card, centred with it as one row */}
        <div class="z-40 max-md:hidden" data-media-rail="desktop">
          {rail()}
        </div>

        {/* Mobile: post info, absolute positioned outside the container */}
        <div
          class="pointer-events-none absolute left-0 right-0 z-40 p-6 pr-20 md:hidden"
          style={{ bottom: infoBottomOffset() }}
        >
          {info()}
        </div>

        {/* Mobile: actions overlay on the right side */}
        <div
          class="absolute right-4 z-40 md:hidden"
          style={{ bottom: actionsBottomOffset() }}
          data-media-rail="phone"
        >
          {rail()}
        </div>
      </Show>
    </div>
  );
}
