import type { VideoFeedItem } from "./video-feed.types";

export interface VideoHomeReviewItem extends VideoFeedItem {
  readonly location: string;
  readonly palette: string;
}

function poster(label: string, start: string, end: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient></defs><rect width="900" height="1600" fill="url(#g)"/><circle cx="720" cy="360" r="250" fill="white" fill-opacity=".14"/><circle cx="140" cy="1210" r="310" fill="black" fill-opacity=".12"/><text x="72" y="1450" fill="white" fill-opacity=".82" font-family="sans-serif" font-size="42" font-weight="700">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Local-only media cards for visual review before video HTTP contracts land. */
export const videoHomeReviewItems: readonly VideoHomeReviewItem[] = [
  {
    id: "review-video-harbor-sunset",
    communityId: "review-community-harbor",
    location: "Harbor",
    palette: "linear-gradient(145deg, #f97316 0%, #7c2d12 48%, #172554 100%)",
    publisher: { handle: "harbor", href: "/c/harbor", kind: "community" },
    caption: "The last ferry leaves when the sky turns this color. 🌅",
    commentCount: 84,
    likeCount: 1280,
    liked: false,
    karaoke: "unavailable",
    study: "ready",
    media: {
      orientation: "portrait",
      posterSrc: poster("HARBOR / 01", "#f97316", "#172554"),
    },
    song: { artist: "Mara Vale", title: "Low Tide Radio", artworkSrc: undefined },
  },
  {
    id: "review-video-builders-deck",
    communityId: "review-community-builders",
    location: "Builders",
    palette: "linear-gradient(145deg, #0f766e 0%, #164e63 48%, #111827 100%)",
    publisher: { handle: "deckhand", href: "/u/deckhand", kind: "profile" },
    caption: "A tiny ship in a very large browser. Building in public.",
    commentCount: 31,
    likeCount: 742,
    liked: false,
    karaoke: "ready",
    study: "ready",
    media: {
      orientation: "portrait",
      posterSrc: poster("BUILDERS / 02", "#0f766e", "#111827"),
    },
    song: { artist: "Open Water", title: "Make It Real" },
  },
  {
    id: "review-video-karaoke-club",
    communityId: "review-community-karaoke",
    location: "Karaoke Club",
    palette: "linear-gradient(145deg, #be185d 0%, #581c87 48%, #1e1b4b 100%)",
    publisher: { handle: "story-pirate", href: "/u/story-pirate", kind: "profile" },
    caption: "Drop the song you would choose for the last set of the night.",
    commentCount: 56,
    likeCount: 963,
    liked: false,
    karaoke: "ready",
    study: "unknown",
    media: {
      orientation: "portrait",
      posterSrc: poster("KARAOKE / 03", "#be185d", "#1e1b4b"),
    },
    song: { artist: "Neon Choir", title: "Last Set", karaokeHref: "/karaoke" },
  },
];
