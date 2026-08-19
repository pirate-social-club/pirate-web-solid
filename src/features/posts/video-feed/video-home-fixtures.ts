import { fixturePosts } from "../../../design-system";
import type { VideoFeedItem } from "./video-feed.types";

export interface VideoHomeReviewItem extends VideoFeedItem {
  readonly location: string;
}

const metadata = [
  {
    communityId: "review-community-harbor",
    location: "Harbor",
    handle: "harbor",
    href: "/c/harbor",
  },
  {
    communityId: "review-community-builders",
    location: "Builders",
    handle: "deckhand",
    href: "/u/deckhand",
  },
  {
    communityId: "review-community-karaoke",
    location: "Karaoke Club",
    handle: "story-pirate",
    href: "/u/story-pirate",
  },
] as const;

/** Local-only media cards reused from the VerticalFeed Storybook fixtures. */
export const videoHomeReviewItems: readonly VideoHomeReviewItem[] = fixturePosts.map((post, index) => {
  const details = metadata[index] ?? metadata[0];
  return {
    id: `review-video-${post.id}`,
    communityId: details.communityId,
    location: details.location,
    publisher: { handle: details.handle, href: details.href, kind: "profile" },
    caption: post.caption,
    commentCount: index === 0 ? 84 : index === 1 ? 31 : 56,
    likeCount: post.likeCount,
    liked: post.isLiked,
    karaoke: index === 2 ? "ready" : "unavailable",
    study: index === 1 ? "ready" : "unknown",
    media: {
      orientation: "portrait",
      posterSrc: post.posterUrl,
      src: post.videoUrl,
    },
    song: post.title && post.artist
      ? { artist: post.artist, title: post.title }
      : undefined,
  } satisfies VideoHomeReviewItem;
});
