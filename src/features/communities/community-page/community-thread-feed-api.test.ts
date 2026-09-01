import type { GetPublicCommunitiesCommunityRefFeedResponse } from "@pirate/api-client-happy-path";
import { describe, expect, test, vi } from "vitest";

import {
  loadCommunityThreadPage,
  normalizeCommunityThreadPage,
} from "./community-thread-feed-api.ts";

const response: GetPublicCommunitiesCommunityRefFeedResponse = JSON.parse(JSON.stringify({
  community: { id: "community-1" },
  items: [{
    post: {
      id: "post-1",
      status: "published",
      post_type: "text",
      identity_mode: "public",
      author_persona: {
        display_name: "Captain One",
        primary_public_handle: "captain-one.pirate",
        avatar_ref: "/media/captain.webp",
      },
      author_public_handle: null,
      anonymous_label: null,
      title: "Welcome aboard",
      body: "The first public thread.",
      caption: null,
      song_title: null,
      created: 1_756_752_000,
    },
    upvote_count: "8",
    downvote_count: "2",
    like_count: 4,
    comment_count: "3",
  }, {
    kind: "age_locked",
    content_rating: "adult_18",
    next_action: { kind: "verify_minimum_age", minimum_age: 18 },
  }],
  next_cursor: "next-page",
}));

describe("public Community thread feed", () => {
  test("projects public threads into the Reddit-style page model", () => {
    expect(normalizeCommunityThreadPage(response)).toEqual({
      posts: [{
        id: "post-1",
        title: "Welcome aboard",
        body: "The first public thread.",
        score: 6,
        publishedAt: "2025-09-01T18:40:00.000Z",
        authorHandle: "captain-one.pirate",
        authorAvatarSrc: "/media/captain.webp",
        kind: "text",
        commentCount: 3,
        learnAvailable: false,
        karaokeAvailable: false,
      }],
      nextCursor: "next-page",
    });
  });

  test("calls the generated public operation with the opaque Community id", async () => {
    const get = vi.fn(async () => response);
    await loadCommunityThreadPage({
      client: { get_publicCommunitiesCommunityRefFeed: get },
      communityRef: "community-1",
      cursor: "cursor-1",
      locale: "en-US",
    });
    expect(get).toHaveBeenCalledWith({
      path: { communityRef: "community-1" },
      query: { surface: "threads", sort: "new", cursor: "cursor-1", locale: "en-US" },
    });
  });
});
