import { describe, expect, test } from "vitest";

import { normalizePublicFeed } from "./public-feed-adapter";

/** The feed envelope's video-to-song association is authoritative: it comes
 * from the server's projection, never from a title or a guess, and a video
 * with its own sound carries none. */

const post = {
  id: "post-1",
  object: "post",
  community: "community-1",
  author_user: null,
  author_public_handle: null,
  authorship_mode: "human_direct",
  identity_mode: "anonymous",
  anonymous_label: "Harbor voice",
  post_type: "video",
  status: "published",
  visibility: "public",
  title: null,
  body: null,
  caption: "A dance",
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
  avatar_ref: null,
  video_feed_enabled: true,
  member_count: 4,
  follower_count: 8,
  view_count: 12,
};

const delivery = { track: "video", playback: { status: "ready" }, thumbnail: { status: "ready" } };

describe("the feed's song reference projection", () => {
  test("carries the referenced song post id for a song-backed video", () => {
    const page = normalizePublicFeed({ items: [{
      community,
      post: {
        post,
        translation_state: "same_language",
        video: {
          ...delivery,
          soundtrack: {
            kind: "song_reference",
            song_reference: { song_post_id: "song-post-1", song_title: "A song", song_author_persona_id: "persona-1" },
            render_mode: "canonical_replace",
          },
        },
      },
    }], top_communities: [], next_cursor: null });
    expect(page.items[0]?.songPostId).toBe("song-post-1");
  });

  test("carries none for a video with its own sound", () => {
    const page = normalizePublicFeed({ items: [{
      community,
      post: {
        post,
        translation_state: "same_language",
        video: {
          ...delivery,
          soundtrack: { kind: "original_audio", original_sound_id: "sound-1", origin_video_post_id: "post-1", origin_author_persona_id: "persona-1" },
        },
      },
    }], top_communities: [], next_cursor: null });
    expect(page.items[0]?.songPostId).toBeNull();
  });

  test("carries none when the soundtrack is missing or malformed", () => {
    for (const video of [
      delivery,
      { ...delivery, soundtrack: { kind: "song_reference" } },
      { ...delivery, soundtrack: { kind: "song_reference", song_reference: { song_post_id: " " } } },
    ]) {
      const page = normalizePublicFeed({ items: [{
        community,
        post: { post, translation_state: "same_language", video },
      }], top_communities: [], next_cursor: null });
      expect(page.items[0]?.songPostId).toBeNull();
    }
  });
});
