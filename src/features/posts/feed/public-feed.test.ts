import { describe, expect, test } from "bun:test";

import {
  fetchPublicFeedPage,
  normalizePublicFeed,
} from "./public-feed-adapter";

const post = {
  id: "post-1",
  object: "post",
  community: "community-1",
  author_user: null,
  author_public_handle: null,
  authorship_mode: "human_direct",
  identity_mode: "anonymous",
  anonymous_label: "Harbor voice",
  post_type: "text",
  status: "published",
  visibility: "public",
  title: "A sovereign town square",
  body: "The body stays canonical.",
  caption: null,
  media_refs: [],
  analysis_state: "allow",
  content_safety_state: "safe",
  age_gate_policy: "none",
  created: 1_755_000_000,
};

const community = {
  id: "community-1",
  object: "home_feed_community_summary",
  display_name: "Harbor",
  route_slug: "harbor",
  avatar_ref: "avatar-1",
  video_feed_enabled: false,
  member_count: 4,
  follower_count: 8,
  view_count: 12,
};

describe("public feed boundary", () => {
  test("projects persisted identity, moderation, translation, and counts without defaults", () => {
    const page = normalizePublicFeed({
      items: [{
        post: {
          post,
          upvote_count: 3,
          downvote_count: 1,
          like_count: 2,
          comment_count: 5,
          viewer_vote: null,
          translation_state: "same_language",
          machine_translated: false,
          translated_title: null,
          translated_body: null,
          translated_caption: null,
        },
        community,
      }],
      top_communities: [community],
      next_cursor: "900719925474099312345",
    });

    expect(page.nextCursor).toBe("900719925474099312345");
    expect(page.items[0]).toMatchObject({
      id: "post-1",
      communityName: "Harbor",
      identityMode: "anonymous",
      anonymousLabel: "Harbor voice",
      analysisState: "allow",
      contentSafetyState: "safe",
      ageGatePolicy: "none",
      likeCount: 2,
      commentCount: 5,
      title: "A sovereign town square",
    });
    expect(page.items[0]?.authorPublicHandle).toBeNull();
    expect(page.items[0]?.createdAt).toBe("2025-08-12T12:00:00.000Z");
    expect(page.topCommunities[0]?.routeSlug).toBe("harbor");
  });

  test("skips malformed items instead of fabricating content", () => {
    const page = normalizePublicFeed({
      items: [
        { post: { post: { ...post, id: "" } }, community },
        { post: { post: { ...post, post_type: "unknown" } }, community },
        {
          post: {
            post: { ...post, id: "valid" },
            translation_state: "same_language",
            machine_translated: false,
          },
          community,
        },
      ],
      top_communities: [],
      next_cursor: null,
    });
    expect(page.items.map(item => item.id)).toEqual(["valid"]);
  });

  test("uses the same-origin /api boundary and never forwards authorization", async () => {
    let seenUrl: URL | undefined;
    let seenAuthorization: string | null = null;
    const page = await fetchPublicFeedPage({
      origin: "https://solid.test",
      locale: "zh",
      sort: "top",
      cursor: "900719925474099312345",
      fetchImpl: async (input, init) => {
        seenUrl = new URL(String(input));
        seenAuthorization = new Headers(init?.headers).get("authorization");
        return Response.json({ items: [], top_communities: [], next_cursor: null });
      },
    });

    expect(page.items).toEqual([]);
    expect(seenUrl?.pathname).toBe("/api/feed/home/public");
    expect(Object.fromEntries(seenUrl?.searchParams ?? [])).toEqual({
      locale: "zh-CN",
      sort: "top",
      cursor: "900719925474099312345",
    });
    expect(seenAuthorization).toBeNull();
  });
});
