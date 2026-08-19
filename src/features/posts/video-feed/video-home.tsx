import { Show, createSignal } from "solid-js";

import {
  IconPlay,
  Type,
  VerticalFeed,
} from "../../../design-system";
import type { MediaPostData } from "../../../design-system";
import type { VideoHomeReviewItem } from "./video-home-fixtures";

export interface VideoHomeProps {
  readonly items?: readonly VideoHomeReviewItem[];
}

function toMediaPost(item: VideoHomeReviewItem): MediaPostData {
  return {
    id: item.id,
    videoUrl: item.media.src,
    posterUrl: item.media.posterSrc,
    authorName: item.publisher.handle,
    publisherHref: item.publisher.href,
    publisherKind: item.publisher.kind,
    ...(item.publisher.kind === "community"
      ? { publisherLabel: `c/${item.publisher.handle}` }
      : {}),
    caption: item.caption,
    title: item.song?.title,
    artist: item.song?.artist,
    likeCount: item.likeCount,
    isLiked: item.liked,
    isFollowing: false,
  };
}

function EmptyVideoHome() {
  return (
    <main class="grid min-h-[100dvh] place-items-center bg-background px-6 text-center" data-video-home-state="unavailable">
      <div class="max-w-md">
        <div class="mx-auto mb-5 grid size-14 place-items-center rounded-full border border-border bg-muted"><IconPlay class="size-6" /></div>
        <Type as="h1" variant="h1">Video home is ready for its feed</Type>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">The vertical 9:16 surface is in place. api-next video-feed contracts are the next dependency for real content.</p>
      </div>
    </main>
  );
}

/** Uses the shared VerticalFeed pattern: desktop 9:16 card plus right action rail. */
export default function VideoHome(props: VideoHomeProps) {
  const initialPosts = () => (props.items ?? []).map(toMediaPost);
  const [posts, setPosts] = createSignal<MediaPostData[]>(initialPosts());
  const [muted, setMuted] = createSignal(true);

  const updatePost = (id: string, update: (post: MediaPostData) => MediaPostData) => {
    setPosts(current => current.map(post => post.id === id ? update(post) : post));
  };

  return (
    <Show when={posts().length > 0} fallback={<EmptyVideoHome />}>
      <main aria-label="Pirate video home" class="relative min-h-[100dvh] bg-background" data-video-home data-video-home-state="ready">
        <VerticalFeed
          feedLabel="Pirate video home"
          hasMobileFooter
          muted={muted()}
          onAuthorClick={(id) => {
            const href = posts().find(post => post.id === id)?.publisherHref;
            if (href?.startsWith("/") && !href.startsWith("//") && typeof window !== "undefined") {
              window.location.assign(href);
            }
          }}
          onFollowClick={(id) => updatePost(id, post => ({ ...post, isFollowing: !post.isFollowing }))}
          onLikeClick={(id) => updatePost(id, post => ({
            ...post,
            isLiked: !post.isLiked,
            likeCount: post.isLiked ? post.likeCount - 1 : post.likeCount + 1,
          }))}
          onMuteToggle={(_, nextMuted) => setMuted(nextMuted)}
          onShareClick={() => {}}
          onSoundtrackClick={() => {}}
          posts={posts()}
        />
      </main>
    </Show>
  );
}
