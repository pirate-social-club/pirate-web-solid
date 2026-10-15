import type { GetPublicCommunitiesCommunityRefFeedResponse } from "@pirate/api-client";
import { describe, expect, test, vi } from "vitest";
import { publicProfileFragment, publicProfileLabel } from "../../identity/public-profile-label.ts";
import { projectPublishedComment } from "../../posts/post-engagement/comment-thread-api.ts";

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
  test("an unnamed profile keeps one label across posts and comments, then its issued name replaces it", () => {
    const item = response.items[0];
    if (!item || !("post" in item)) throw new Error("Expected the public post fixture");
    const persona = { object: "persona" as const, persona_id: "community-profile-one",
      primary_public_handle: null, display_name: null, avatar_ref: null };
    const project = (publicHandle: string | null) => {
      const author = { ...persona, primary_public_handle: publicHandle };
      const feed: GetPublicCommunitiesCommunityRefFeedResponse = JSON.parse(JSON.stringify({ ...response,
        items: ["post-a", "post-b"].map(id => ({ ...item, post: { ...item.post, id, author_persona: author } })) }));
      const comment = projectPublishedComment({ comment_id: "comment-a", parent_comment_id: null,
        body: "Earlier comment", depth: 0, reply_count: 0, status: "published", content_rating: "general",
        created_at: "2026-10-09T00:00:00Z", author_persona: author });
      return { posts: normalizeCommunityThreadPage(feed).posts, comment };
    };
    const before = project(null);
    const label = before.posts[0]?.authorHandle;
    expect(label).toMatch(/^User [0-9A-V]{6}$/u);
    expect(before.posts[1]?.authorHandle).toBe(label);
    expect(before.comment.authorLabel).toBe(label);
    expect(before.comment.authorPersonaId).toBe(persona.persona_id);
    const after = project("nightowl.8s28");
    expect(after.posts.map(post => post.authorHandle)).toEqual(["nightowl.8s28", "nightowl.8s28"]);
    expect(after.comment.authorLabel).toBe("nightowl.8s28");
    expect(after.posts.map(post => post.id)).toEqual(before.posts.map(post => post.id));
    expect(after.posts.map(post => post.authorPersonaId)).toEqual(before.posts.map(post => post.authorPersonaId));
    expect(after.comment.id).toBe(before.comment.id);
    expect(after.comment.authorPersonaId).toBe(before.comment.authorPersonaId);
  });

  test("explicit anonymous authors do not acquire a profile-derived label or profile link", () => {
    const item = response.items[0];
    if (!item || !("post" in item)) throw new Error("Expected the public post fixture");
    const feed: GetPublicCommunitiesCommunityRefFeedResponse = JSON.parse(JSON.stringify({ ...response,
      items: [{ ...item, post: { ...item.post, identity_mode: "anonymous", anonymous_label: "Quiet listener",
        author_persona: { persona_id: "public-profile-retained", display_name: "Retained name", primary_public_handle: null, avatar_ref: "/retained-avatar" } } }] }));
    const post = normalizeCommunityThreadPage(feed).posts[0];
    expect(post?.authorHandle).toBe("Quiet listener");
    expect(post?.authorPersonaId).toBeUndefined();
    expect(post?.authorAvatarSrc).toBeNull();
  });

  test("labels hash the full community profile id and preserve chosen display names", () => {
    expect(publicProfileFragment("community-one-same-suffix")).not.toBe(publicProfileFragment("community-two-same-suffix"));
    const persona = { persona_id: "profile-one", primary_public_handle: null, display_name: "Chosen label" };
    expect(publicProfileLabel(persona)).toBe("Chosen label");
    expect(publicProfileLabel({ ...persona, primary_public_handle: "nightowl.8s28" })).toBe("nightowl.8s28");
    expect(publicProfileLabel({ ...persona, display_name: "  " })).toMatch(/^User [0-9A-V]{6}$/u);
    expect(publicProfileLabel(null)).toBe("Unavailable profile");
    expect(publicProfileLabel({ ...persona, display_name: null }, "ar")).toContain(publicProfileFragment(persona.persona_id));
    expect(publicProfileLabel({ ...persona, display_name: null }, "zh")).toContain(publicProfileFragment(persona.persona_id));
  });

  test("projects public threads into the Reddit-style page model", () => {
    expect(normalizeCommunityThreadPage(response)).toEqual({
      ageLockedCount: 1,
      posts: [{
        id: "post-1",
        title: "Welcome aboard",
        body: "The first public thread.",
        score: 6,
        upvoteCount: 8,
        downvoteCount: 2,
        publishedAt: "2025-09-01T18:40:00.000Z",
        authorHandle: "captain-one.pirate",
        authorPublicHandle: null,
        authorProfile: response.items[0] && "post" in response.items[0] ? response.items[0].post.author_persona : null,
        authorAvatarSrc: "/media/captain.webp",
        kind: "text",
        supportsPostReports: true,
        commentCount: 3,
      }],
      nextCursor: "next-page",
    });
  });

  test.each(["song", "video"])("does not expose text-submission reports for %s posts", (postType) => {
    const item = response.items[0];
    if (!item || !("post" in item)) throw new Error("Expected the public post fixture");
    const media: GetPublicCommunitiesCommunityRefFeedResponse = JSON.parse(JSON.stringify({
      ...response,
      items: [{ ...item, post: { ...item.post, post_type: postType } }],
    }));
    expect(normalizeCommunityThreadPage(media).posts[0]?.supportsPostReports).toBe(false);
  });

  test("projects a video's delivery status, age policy and soundtrack title, never a media URL", () => {
    const item = response.items[0];
    if (!item || !("post" in item)) throw new Error("Expected the public post fixture");
    const feed: GetPublicCommunitiesCommunityRefFeedResponse = JSON.parse(JSON.stringify({ ...response,
      items: [{ ...item,
        post: { ...item.post, post_type: "video", title: null, body: null, caption: "Late-night loop, take two.",
          age_gate_policy: "18_plus", media_refs: [{ playback_url: "https://example.com/leak.m3u8" }] },
        video: { track: "video", caption: "Late-night loop, take two.", caption_dir: "ltr", caption_lang: "en",
          soundtrack: { kind: "song_reference", render_mode: "canonical_replace",
            song_reference: { song_post_id: "song-1", song_title: "Harbor Lights", song_author_persona_id: "persona-1" } },
          playback: { status: "ready", provider: "stream", playback_ref: "opaque-ref" },
          thumbnail: { status: "pending" }, data_registration: "registered", capabilities: { can_post_with_song: true } } }] }));
    const [post] = normalizeCommunityThreadPage(feed).posts;
    expect(post).toMatchObject({ kind: "video", body: "Late-night loop, take two.", mediaTitle: "Harbor Lights",
      requiresAgeVerification: true, supportsPostReports: false, video: { playback: "ready", thumbnail: "pending" } });
    expect(JSON.stringify(post)).not.toContain("leak.m3u8");
    expect(JSON.stringify(post)).not.toContain("opaque-ref");
  });

  test("a video without a delivery projection is unavailable, and an original sound names no song", () => {
    const item = response.items[0];
    if (!item || !("post" in item)) throw new Error("Expected the public post fixture");
    const feed: GetPublicCommunitiesCommunityRefFeedResponse = JSON.parse(JSON.stringify({ ...response,
      items: [{ ...item, post: { ...item.post, id: "bare", post_type: "video" } }, { ...item,
        post: { ...item.post, id: "original", post_type: "video" },
        video: { track: "video", caption: null, caption_dir: null, caption_lang: null,
          soundtrack: { kind: "original_audio", original_sound_id: "s", origin_video_post_id: "original", origin_author_persona_id: "p" },
          playback: { status: "pending" }, thumbnail: { status: "unavailable" }, data_registration: "registration_pending",
          capabilities: { can_post_with_song: false } } }] }));
    const [bare, original] = normalizeCommunityThreadPage(feed).posts;
    expect(bare?.video).toEqual({ playback: "unavailable", thumbnail: "unavailable" });
    expect(original?.video).toEqual({ playback: "pending", thumbnail: "unavailable" });
    expect(original?.mediaTitle).toBeUndefined();
  });

  test.each(["image", "link", "crosspost", "file"])("leaves %s posts out instead of drawing them as text", (postType) => {
    const item = response.items[0];
    if (!item || !("post" in item)) throw new Error("Expected the public post fixture");
    const feed: GetPublicCommunitiesCommunityRefFeedResponse = JSON.parse(JSON.stringify({ ...response,
      items: [{ ...item, post: { ...item.post, post_type: postType } }] }));
    expect(normalizeCommunityThreadPage(feed).posts).toEqual([]);
  });

  test("keeps both vote sides when the net score cannot express them", () => {
    const mixed: GetPublicCommunitiesCommunityRefFeedResponse = JSON.parse(JSON.stringify({
      ...response,
      items: [{ ...response.items[0], upvote_count: "5", downvote_count: "3" }],
    }));
    const [post] = normalizeCommunityThreadPage(mixed).posts;
    // A post nobody downvoted would carry the same score, so the score alone
    // cannot be turned back into these two numbers.
    expect(post?.score).toBe(2);
    expect(post?.upvoteCount).toBe(5);
    expect(post?.downvoteCount).toBe(3);
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
