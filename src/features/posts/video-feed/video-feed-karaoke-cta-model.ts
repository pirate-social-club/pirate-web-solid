import type { VideoFeedItem } from "./video-feed.types";

export type VideoFeedKaraokeCtaInput = Pick<VideoFeedItem, "karaoke" | "rewards" | "song">;

export function karaokeFeedCtaModel(item: VideoFeedKaraokeCtaInput): { href: string; label: string } | null {
  const href = item.song?.karaokeHref;
  if (item.karaoke !== "ready" || !href) return null;
  return {
    href,
    label: item.rewards?.karaoke?.amountLabel ? `Sing · ${item.rewards.karaoke.amountLabel}` : "Sing",
  };
}
