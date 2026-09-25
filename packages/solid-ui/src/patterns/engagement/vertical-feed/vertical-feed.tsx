import { createEffect, createSignal, For, onSettled, Show, untrack, type Accessor } from "solid-js";
import type { JSX } from "@solidjs/web";

import { Spinner } from "@/components/feedback/spinner/spinner";
import { cn } from "@/lib/cn";

import { MediaPost } from "./media-post";
import type { HapticKind, MediaPostData, VideoSourceAttacher } from "./types";
import { useVideoPlayback, VideoPlaybackProvider } from "./video-playback";

/**
 * Playback policy for one non-media row rendered by the host. The accessors
 * are reactive: a host player follows the active row, the feed autoplay
 * policy, the first-interaction gate and the controlled mute without being
 * re-rendered.
 */
export interface VerticalFeedPlaceholderContext {
  /** True while this row is the feed's active post. */
  readonly active: Accessor<boolean>;
  /** True when the feed would autoplay this row (host autoplay, active, not paused). */
  readonly autoplay: Accessor<boolean>;
  /** True once any player in the feed saw a user interaction. */
  readonly hasUserInteracted: Accessor<boolean>;
  /** Record a user interaction, unlocking autoplay across the feed. */
  readonly markUserInteracted: () => void;
  /** Controlled feed mute; undefined means each row owns its audio. */
  readonly muted: Accessor<boolean | undefined>;
  /** Report this row's mute toggle to the host. */
  readonly reportMuteToggle: (muted: boolean) => void;
}

export interface VerticalFeedProps {
  posts: (MediaPostData | Readonly<{ id: string; placeholder: true }>)[];
  /**
   * Product-owned content-free rows retain their place without inventing media
   * or authors. The host receives the row's playback policy so an embedded
   * player can obey the same active-item, interaction and mute rules as a
   * normal media card.
   */
  renderPlaceholder?: (id: string, context: VerticalFeedPlaceholderContext) => JSX.Element;
  /** Disable automatic playback after a host verification or authorization refresh. Manual play remains available. */
  autoplay?: boolean;
  /** Show a loading row at the end of the list. */
  loading?: boolean;
  /** More posts exist; onEndReached fires near the end of the list. */
  hasMore?: boolean;
  /** Scroll to this post on mount. */
  initialPostId?: string;
  /** Controlled feed-wide audio state. */
  muted?: boolean;
  /** Autoplay the active post without waiting for a first interaction (host keeps it muted until a tap). */
  forceAutoplay?: boolean;
  /** Host-owned delivery: returns the source attacher for a post with no direct videoUrl. */
  attachVideo?: (postId: string) => VideoSourceAttacher | undefined;
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
 * One host-rendered row. This is a component under the playback provider so
 * the interaction gate reaches the placeholder context even though the host
 * itself renders outside the provider.
 */
function PlaceholderRow(props: {
  readonly id: string;
  readonly active: Accessor<boolean>;
  readonly autoplay: Accessor<boolean>;
  readonly muted: Accessor<boolean | undefined>;
  readonly onMuteToggle?: (postId: string, muted: boolean) => void;
  readonly render?: (id: string, context: VerticalFeedPlaceholderContext) => JSX.Element;
}) {
  const playback = useVideoPlayback();
  return props.render?.(props.id, {
    active: props.active,
    autoplay: props.autoplay,
    hasUserInteracted: () => playback?.hasUserInteracted() ?? false,
    markUserInteracted: () => playback?.markUserInteracted(),
    muted: props.muted,
    reportMuteToggle: (muted) => props.onMuteToggle?.(props.id, muted),
  });
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
            {(post, index) => {
              const media = () => { const value = post(); return "placeholder" in value ? undefined : value; };
              return (
              <div class="h-[100dvh] w-full snap-start snap-always md:h-screen">
                <Show
                  when={media()}
                  fallback={
                    <PlaceholderRow
                      id={post().id}
                      active={() => index() === activeIndex()}
                      autoplay={() =>
                        props.autoplay !== false &&
                        index() === activeIndex() &&
                        props.pausedPostId !== post().id
                      }
                      muted={() => props.muted}
                      onMuteToggle={props.onMuteToggle}
                      render={props.renderPlaceholder}
                    />
                  }
                >
                  {entry => <MediaPost
                  id={entry().id}
                  videoUrl={entry().videoUrl}
                  posterUrl={entry().posterUrl}
                  authorName={entry().authorName}
                  authorAvatarUrl={entry().authorAvatarUrl}
                  caption={entry().caption}
                  title={entry().title}
                  artist={entry().artist}
                  mediaImageUrl={entry().mediaImageUrl}
                  likeCount={entry().likeCount}
                  isLiked={entry().isLiked}
                  isFollowing={entry().isFollowing}
                  autoplay={
                    props.autoplay !== false && index() === activeIndex() && props.pausedPostId !== entry().id
                  }
                  muted={props.muted}
                  forceAutoplay={props.forceAutoplay}
                  attachVideo={entry().videoUrl ? undefined : props.attachVideo?.(entry().id)}
                  showChrome={props.showChrome}
                  priorityLoad={Math.abs(index() - activeIndex()) <= 1}
                  hasMobileFooter={props.hasMobileFooter}
                  onLikeClick={
                    props.onLikeClick
                      ? () => props.onLikeClick?.(entry().id)
                      : undefined
                  }
                  onShareClick={
                    props.onShareClick
                      ? () => props.onShareClick?.(entry().id)
                      : undefined
                  }
                  onFollowClick={
                    props.onFollowClick
                      ? () => props.onFollowClick?.(entry().id)
                      : undefined
                  }
                  onAuthorClick={
                    props.onAuthorClick
                      ? () => props.onAuthorClick?.(entry().id)
                      : undefined
                  }
                  onSoundtrackClick={
                    props.onSoundtrackClick
                      ? () => props.onSoundtrackClick?.(entry().id)
                      : undefined
                  }
                  onMuteToggle={(muted) => props.onMuteToggle?.(entry().id, muted)}
                  onTimeUpdate={props.onTimeUpdate}
                  onViewed={props.onViewed}
                  onHaptic={props.onHaptic}
                />}
                </Show>
              </div>
            ); }}
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
