import type { PublicFeedPage } from "./public-feed-adapter.ts";
import type { PlaybackGrant } from "../video-submission/playback-access.ts";
import type { SongAttributionLinkResolver } from "../song-attribution/song-attribution.ts";
import reviewVideoUrl from "../../../../packages/solid-ui/src/patterns/engagement/vertical-feed/fixtures/clip-1.mp4";
import reviewPosterUrl from "../../../../packages/solid-ui/src/patterns/engagement/vertical-feed/fixtures/poster-1.jpg";

/**
 * Review seams for the local fixture route and its stories. The primary
 * review video is a playable delivery-shaped item: the mint answers with the
 * harness playback URL (Chromium maps the customer host to the loopback TLS
 * media server) and the poster is a local asset, so the fixture plays without
 * a provider or a live API.
 */
export const reviewPlaybackMint = async (): Promise<PlaybackGrant> => {
  const now = Date.now();
  return {
    url: "https://customer-harness.cloudflarestream.com/harness.harness.harness/manifest/video.m3u8",
    expiresAt: now + 240_000,
    renewAt: now + 120_000,
  };
};
export const reviewPosterPath = (): string => reviewPosterUrl;
export const reviewSongLinks: SongAttributionLinkResolver = async (attribution) => ({
  href: `/p/${encodeURIComponent(attribution.songPostId)}`,
  title: "Harness practice song",
  authorName: "Harness learner 1",
});

/**
 * Deliberately local review data. It gives the shell a useful visual state
 * without pretending staging has seeded public content yet.
 */
export const publicFeedReviewPage: PublicFeedPage = {
  items: [
    {
      id: "review-post-harbor",
      communityId: "review-community-harbor",
      communityName: "Harbor",
      communityRouteSlug: "harbor",
      communityAvatarRef: null,
      authorUser: null,
      authorPublicHandle: null,
      anonymousLabel: "Harbor voice",
      identityMode: "anonymous",
      authorshipMode: "human_direct",
      postType: "video",
      status: "published",
      visibility: "public",
      title: "A sovereign town square",
      body: "The public feed is where communities find one another: ideas, questions, songs, and small moments worth sharing.",
      caption: "A sovereign town square for communities, creators, and the moments worth sharing.",
      createdAt: "2026-08-19T09:20:00.000Z",
      mediaRefs: [reviewVideoUrl],
      videoDelivery: { playback: "ready", thumbnail: "ready" },
      songPostId: "post_harness_song",
      analysisState: "allow",
      contentSafetyState: "safe",
      ageGatePolicy: "none",
      upvoteCount: 18,
      downvoteCount: 1,
      likeCount: 24,
      commentCount: 7,
      viewerVote: null,
      translationState: "same_language",
      machineTranslated: false,
      translatedTitle: null,
      translatedBody: null,
      translatedCaption: null,
    },
    {
      id: "review-post-karaoke",
      communityId: "review-community-karaoke",
      communityName: "Karaoke Club",
      communityRouteSlug: "karaoke-club",
      communityAvatarRef: null,
      authorUser: "story-pirate",
      authorPublicHandle: "story-pirate",
      anonymousLabel: null,
      identityMode: "public",
      authorshipMode: "human_direct",
      postType: "song",
      status: "published",
      visibility: "public",
      title: "Late-night karaoke roll call",
      body: "Drop the song you would choose for the last set of the night.",
      caption: null,
      createdAt: "2026-08-19T07:05:00.000Z",
      mediaRefs: [],
      analysisState: "allow",
      contentSafetyState: "safe",
      ageGatePolicy: "none",
      upvoteCount: 9,
      downvoteCount: 0,
      likeCount: 12,
      commentCount: 3,
      viewerVote: null,
      translationState: "same_language",
      machineTranslated: false,
      translatedTitle: null,
      translatedBody: null,
      translatedCaption: null,
    },
    {
      id: "review-post-builders",
      communityId: "review-community-builders",
      communityName: "Builders",
      communityRouteSlug: "builders",
      communityAvatarRef: null,
      authorUser: null,
      authorPublicHandle: null,
      anonymousLabel: "A builder",
      identityMode: "anonymous",
      authorshipMode: "human_direct",
      postType: "text",
      status: "published",
      visibility: "public",
      title: "What are you making this week?",
      body: "A lightweight place to share work in progress, ask for help, and find collaborators across the network.",
      caption: null,
      createdAt: "2026-08-18T19:40:00.000Z",
      mediaRefs: [],
      analysisState: "allow",
      contentSafetyState: "safe",
      ageGatePolicy: "none",
      upvoteCount: 31,
      downvoteCount: 2,
      likeCount: 38,
      commentCount: 11,
      viewerVote: null,
      translationState: "same_language",
      machineTranslated: false,
      translatedTitle: null,
      translatedBody: null,
      translatedCaption: null,
    },
  ],
  topCommunities: [
    {
      id: "review-community-harbor",
      displayName: "Harbor",
      routeSlug: "harbor",
      avatarRef: null,
      videoFeedEnabled: false,
      memberCount: 248,
      followerCount: 410,
      viewCount: 1200,
    },
  ],
  nextCursor: null,
};

/**
 * Dedicated processing/error fixture. The ordinary review page never renders
 * these as full-screen items; they exist for the stories and tests that own
 * the author-visible delivery states.
 */
export const publicFeedProcessingPage: PublicFeedPage = {
  items: [
    {
      ...publicFeedReviewPage.items[0]!,
      id: "review-post-processing",
      caption: "A video still being prepared.",
      videoDelivery: { playback: "pending", thumbnail: "pending" },
      songPostId: "post_harness_song",
    },
    {
      ...publicFeedReviewPage.items[0]!,
      id: "review-post-unavailable",
      caption: "A video whose playback failed.",
      videoDelivery: { playback: "unavailable", thumbnail: "unavailable" },
      songPostId: null,
    },
  ],
  topCommunities: [],
  nextCursor: null,
};
