import { describe, expect, test } from "bun:test";

import type { PublicFeedItem } from "../feed/public-feed-adapter.ts";
import {
  publisherDestination,
  resolveVideoMedia,
  safeMediaUrl,
  toHomeVideoPost,
} from "./home-video-feed-model.ts";

function item(overrides: Partial<PublicFeedItem> = {}): PublicFeedItem {
  return {
    id: "video-1",
    communityId: "community-1",
    communityName: "Harbor",
    communityRouteSlug: "harbor",
    communityAvatarRef: "/media/harbor-avatar.webp",
    authorUser: "user-1",
    authorPersonaId: "persona-1",
    authorDisplayName: "Captain One",
    authorAvatarRef: "/media/captain.webp",
    authorPrimaryPublicHandle: "captain-one.pirate",
    authorPublicHandle: null,
    anonymousLabel: null,
    identityMode: "public",
    authorshipMode: "human_direct",
    postType: "video",
    status: "published",
    visibility: "public",
    title: null,
    body: null,
    caption: "From the harbor",
    createdAt: "2026-09-01T18:00:00.000Z",
    mediaRefs: [{ playback_url: "https://media.pirate.test/video-1.mp4", poster_url: "/media/video-1.webp" }],
    analysisState: "allow",
    contentSafetyState: "safe",
    ageGatePolicy: "none",
    upvoteCount: 4,
    downvoteCount: 0,
    likeCount: 9,
    commentCount: 2,
    viewerVote: 1,
    translationState: "same_language",
    machineTranslated: false,
    translatedTitle: null,
    translatedBody: null,
    translatedCaption: null,
    ...overrides,
  };
}

describe("home video feed projection", () => {
  test("routes public publishers to their canonical profile", () => {
    expect(publisherDestination(item())).toBe("/u/captain-one.pirate");
    expect(publisherDestination(item({ authorPrimaryPublicHandle: null, authorPersonaId: "persona-2" }))).toBe("/p/persona-2");
  });

  test("routes anonymous and Community-primary publishers to the Community", () => {
    expect(publisherDestination(item({ identityMode: "anonymous" }))).toBe("/c/harbor");
    expect(publisherDestination(item({ identityMode: "anonymous", communityRouteSlug: null }))).toBe("/c/community-1");
  });

  test("maps a reviewed playable reference into the vertical-feed shape", () => {
    expect(toHomeVideoPost(item())).toEqual({
      id: "video-1",
      videoUrl: "https://media.pirate.test/video-1.mp4",
      posterUrl: "/media/video-1.webp",
      authorName: "captain-one.pirate",
      authorAvatarUrl: "/media/captain.webp",
      caption: "From the harbor",
      likeCount: 9,
      isLiked: true,
      destination: "/u/captain-one.pirate",
      communityDestination: "/c/harbor",
    });
  });

  test("fails closed for opaque storage references and unsafe URLs", () => {
    expect(resolveVideoMedia(["r2:opaque-object"])).toBeNull();
    expect(toHomeVideoPost(item({ mediaRefs: ["r2:opaque-object"] }))).toBeNull();
    expect(safeMediaUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeMediaUrl("//media.invalid/video.mp4")).toBeUndefined();
  });
});
