import { createEffect, createSignal, For, onSettled, Show, untrack } from "solid-js";

import { Spinner } from "@/components/feedback/spinner/spinner";
import { cn } from "@/lib/cn";

import { MediaPost } from "./media-post";
import type { HapticKind, MediaPostData } from "./types";
import { VideoPlaybackProvider } from "./video-playback";

export interface VerticalFeedProps {
  posts: MediaPostData[];
  /** Show a loading row at the end of the list. */
  loading?: boolean;
  /** More posts exist; onEndReached fires near the end of the list. */
  hasMore?: boolean;
  /** Scroll to this post on mount. */
  initialPostId?: string;
  /** Controlled feed-wide audio state. */
  muted?: boolean;
  /** Temporarily pause this post while a host panel obscures playback. */
  pausedPostId?: string;
  /** Hide shared author/action chrome when the product host renders its own. */
  showChrome?: boolean;
  /** Lift per-post overlays above a host app's mobile tab bar. */
  hasMobileFooter?: boolean;
  /** Message shown when there are no posts and nothing is loading. */
  emptyMessage?: string;
  /** Accessible name for the feed scroll region. */
  feedLabel?: string;
  class?: string;
  onActivePostChange?: (postId: string, index: number) => void;
  /** Infinite-scroll trigger: fired when the active post nears the end. */
  onEndReached?: () => void;
  onLikeClick?: (postId: string) => void;
  onShareClick?: (postId: string) => void;
  onFollowClick?: (postId: string) => void;
  onAuthorClick?: (postId: string) => void;
  onSoundtrackClick?: (postId: string) => void;
  onMuteToggle?: (postId: string, muted: boolean) => void;
  /** Reports playback progress for the exact post that emitted it. */
  onTimeUpdate?: (postId: string, currentTime: number, duration: number) => void;
  /** Called once per post after 3 seconds of cumulative watch time. */
  onViewed?: (postId: string) => void;
  /** Haptic hints (scroll snap, like) for the host app to map to vibration. */
  onHaptic?: (kind: HapticKind) => void;
}

/**
 * VerticalFeed - vertical, snap-scrolling media feed. Renders plain
 * MediaPostData, autoplays the active post behind a first-interaction gate,
 * supports ArrowUp/ArrowDown navigation, and reports every intent
 * (like, share, follow, author, soundtrack, mute, view, end-of-feed) through
 * callbacks. It never routes, notifies, or fetches by itself.
 */
export function VerticalFeed(props: VerticalFeedProps) {
  let containerRef: HTMLDivElement | undefined;
  const [activeIndex, setActiveIndex] = createSignal(0);

  // Report active-post changes and the end-of-feed signal from one place.
  // The apply phase only calls host callbacks; all tracked state is read in
  // the compute phase.
  createEffect(
    () => activeIndex(),
    (index) => {
      // Deliberately untracked: emit from the index change alone; post-data
      // updates (e.g. a like toggle) must not re-emit.
      untrack(() => {
        const post = props.posts[index];
        if (post) props.onActivePostChange?.(post.id, index);
        if (props.hasMore && index >= props.posts.length - 2) {
          props.onEndReached?.();
        }
      });
    },
  );

  // Scroll to the initial post once the list has settled.
  onSettled(() => {
    const el = containerRef;
    if (!el || !props.initialPostId || props.posts.length === 0) return;
    const index = props.posts.findIndex((post) => post.id === props.initialPostId);
    if (index >= 0) {
      el.scrollTo({ top: index * el.clientHeight, behavior: "auto" });
      setActiveIndex(index);
    }
  });

  const scrollToIndex = (index: number, behavior: ScrollBehavior) => {
    containerRef?.scrollTo({ top: index * containerRef.clientHeight, behavior });
  };

  const handleScroll = () => {
    const el = containerRef;
    if (!el || el.clientHeight === 0) return;

    const newIndex = Math.round(el.scrollTop / el.clientHeight);
    if (
      newIndex !== activeIndex() &&
      newIndex >= 0 &&
      newIndex < props.posts.length
    ) {
      props.onHaptic?.("light");
      setActiveIndex(newIndex);
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    let nextIndex: number | undefined;
    if (event.key === "ArrowDown" && activeIndex() < props.posts.length - 1) {
      nextIndex = activeIndex() + 1;
    } else if (event.key === "ArrowUp" && activeIndex() > 0) {
      nextIndex = activeIndex() - 1;
    }
    if (nextIndex === undefined) return;

    event.preventDefault();
    setActiveIndex(nextIndex);
    scrollToIndex(nextIndex, "smooth");
  };

  return (
    <Show
      when={props.posts.length > 0 || props.loading}
      fallback={
        <div class="flex h-[100dvh] w-full items-center justify-center bg-background md:h-screen">
          <p class="text-lg text-muted-foreground">
            {props.emptyMessage ?? "No posts to show"}
          </p>
        </div>
      }
    >
      <VideoPlaybackProvider>
        <div
          ref={(el) => {
            containerRef = el;
          }}
          role="region"
          aria-label={props.feedLabel ?? "Media feed"}
          tabindex={0}
          class={cn(
            "h-[100dvh] w-full snap-y snap-mandatory overflow-y-scroll [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:h-screen",
            props.class,
          )}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
        >
          <For each={props.posts} keyed={(post) => post.id}>
            {(post, index) => (
              <div class="h-[100dvh] w-full snap-start snap-always md:h-screen">
                <MediaPost
                  id={post().id}
                  videoUrl={post().videoUrl}
                  posterUrl={post().posterUrl}
                  authorName={post().authorName}
                  authorAvatarUrl={post().authorAvatarUrl}
                  caption={post().caption}
                  title={post().title}
                  artist={post().artist}
                  mediaImageUrl={post().mediaImageUrl}
                  likeCount={post().likeCount}
                  isLiked={post().isLiked}
                  isFollowing={post().isFollowing}
                  autoplay={
                    index() === activeIndex() && props.pausedPostId !== post().id
                  }
                  muted={props.muted}
                  showChrome={props.showChrome}
                  priorityLoad={Math.abs(index() - activeIndex()) <= 1}
                  hasMobileFooter={props.hasMobileFooter}
                  onLikeClick={
                    props.onLikeClick
                      ? () => props.onLikeClick?.(post().id)
                      : undefined
                  }
                  onShareClick={
                    props.onShareClick
                      ? () => props.onShareClick?.(post().id)
                      : undefined
                  }
                  onFollowClick={
                    props.onFollowClick
                      ? () => props.onFollowClick?.(post().id)
                      : undefined
                  }
                  onAuthorClick={
                    props.onAuthorClick
                      ? () => props.onAuthorClick?.(post().id)
                      : undefined
                  }
                  onSoundtrackClick={
                    props.onSoundtrackClick
                      ? () => props.onSoundtrackClick?.(post().id)
                      : undefined
                  }
                  onMuteToggle={(muted) => props.onMuteToggle?.(post().id, muted)}
                  onTimeUpdate={props.onTimeUpdate}
                  onViewed={props.onViewed}
                  onHaptic={props.onHaptic}
                />
              </div>
            )}
          </For>

          <Show when={props.loading}>
            <div class="flex h-20 items-center justify-center">
              <Spinner size="lg" label="Loading more posts" />
            </div>
          </Show>
        </div>
      </VideoPlaybackProvider>
    </Show>
  );
}
