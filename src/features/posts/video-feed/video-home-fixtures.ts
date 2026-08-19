import { fixturePosts } from "../../../design-system";
import type { VideoFeedItem } from "./video-feed.types";

export interface VideoHomeReviewItem extends VideoFeedItem {
  readonly communityName: string;
  readonly location: string;
}

const metadata = [
  {
    communityId: "review-community-harbor",
    communityName: "Harbor",
    location: "Harbor",
    routeSlug: "harbor",
    href: "/c/harbor",
  },
  {
    communityId: "review-community-builders",
    communityName: "Builders",
    location: "Builders",
    routeSlug: "builders",
    href: "/c/builders",
  },
  {
    communityId: "review-community-karaoke",
    communityName: "Karaoke Club",
    location: "Karaoke Club",
    routeSlug: "karaoke-club",
    href: "/c/karaoke-club",
  },
] as const;

/** Local-only media cards reused from the VerticalFeed Storybook fixtures. */
export const videoHomeReviewItems: readonly VideoHomeReviewItem[] = fixturePosts.map((post, index) => {
  const details = metadata[index] ?? metadata[0];
  return {
    id: `review-video-${post.id}`,
    communityId: details.communityId,
    communityName: details.communityName,
    location: details.location,
    publisher: { handle: details.routeSlug, href: details.href, kind: "community" },
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
