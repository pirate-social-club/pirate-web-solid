import type { MediaPostData } from "../types";

import clip1Url from "./clip-1.mp4";
import clip2Url from "./clip-2.mp4";
import clip3Url from "./clip-3.mp4";
import poster1Url from "./poster-1.jpg";
import poster2Url from "./poster-2.jpg";
import poster3Url from "./poster-3.jpg";

/**
 * Deterministic local fixtures: tiny generated clips and posters committed
 * under this directory. No network, no randomness. Authors, titles, and
 * artists are fictional.
 */
export const fixturePosts: MediaPostData[] = [
  {
    id: "post-1",
    videoUrl: clip1Url,
    posterUrl: poster1Url,
    authorName: "wavemaker",
    caption: "Chasing the late light across the harbor.",
    title: "Neon Skyline",
    artist: "Glass Avenue",
    likeCount: 1234,
    isLiked: false,
    isFollowing: false,
  },
  {
    id: "post-2",
    videoUrl: clip2Url,
    posterUrl: poster2Url,
    authorName: "nightowl",
    caption: "Second post in the feed. Scroll or press ArrowDown.",
    title: "City Lights",
    artist: "The North Winds",
    likeCount: 5678,
    isLiked: true,
    isFollowing: false,
  },
  {
    id: "post-3",
    videoUrl: clip3Url,
    posterUrl: poster3Url,
    authorName: "stargazer",
    caption: "Third post. No soundtrack attached to this one.",
    likeCount: 12400,
    isLiked: false,
    isFollowing: true,
  },
];

/** A post with a deliberately broken video source, for the Error story. */
export const brokenPost: MediaPostData = {
  id: "post-broken",
  videoUrl: "/missing-vertical-feed-fixture.mp4",
  authorName: "wavemaker",
  caption: "This post's video source does not exist.",
  title: "Neon Skyline",
  artist: "Glass Avenue",
  likeCount: 12,
  isLiked: false,
  isFollowing: false,
};

/** A post with a long caption, for the LongContent story. */
export const longCaptionPost: MediaPostData = {
  ...fixturePosts[0],
  id: "post-long",
  caption:
    "A deliberately long caption that keeps going well past two lines so the clamping behavior is visible: the route along the ridge took all afternoon, the light kept changing every few minutes, and by the time we reached the overlook the whole valley had turned a deep amber that no camera quite captures, so consider this post the closest approximation we managed to record before the batteries gave out.",
};
