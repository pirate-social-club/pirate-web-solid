import type { GetFeedHomePublicResponse } from "@pirate/api-client";

/**
 * Sanitized from the staging response that exposed the 0.25 client drift.
 * The nullable source hash and age-locked union member are the significant
 * wire details; identifiers and copy are deliberately synthetic.
 */
export const publicFeedStagingContractFixture = {
  items: [
    {
      post: {
        canonical_path: "/posts/sanitized-staging-song",
        post: {
          id: "fixture-song-1",
          object: "post",
          community: "fixture-community-1",
          authorship_mode: "human_direct",
          identity_mode: "public",
          post_type: "song",
          status: "published",
          visibility: "public",
          title: "Sanitized staging song",
          body: "A contract-shaped public feed fixture.",
          media_refs: [],
          analysis_state: "allow",
          content_safety_state: "safe",
          age_gate_policy: "none",
          created: 1_787_500_000,
        },
        thread_snapshot: null,
        upvote_count: 4,
        downvote_count: 0,
        like_count: 3,
        comment_count: 2,
        viewer_vote: null,
        viewer_reaction_kinds: [],
        resolved_locale: "en",
        translation_state: "policy_blocked",
        machine_translated: false,
        source_hash: null,
      },
      community: {
        id: "fixture-community-1",
        object: "home_feed_community_summary",
        display_name: "Fixture Community",
        route_slug: "fixture-community",
        avatar_ref: null,
        video_feed_enabled: true,
        member_count: 12,
        follower_count: 18,
        view_count: 30,
      },
    },
    {
      kind: "age_locked",
      content_rating: "adult_18",
      next_action: {
        kind: "verify_minimum_age",
        minimum_age: 18,
      },
    },
  ],
  top_communities: [
    {
      id: "fixture-community-1",
      object: "home_feed_community_summary",
      display_name: "Fixture Community",
      route_slug: "fixture-community",
      avatar_ref: null,
      video_feed_enabled: true,
      member_count: 12,
      follower_count: 18,
      view_count: 30,
    },
  ],
  next_cursor: null,
} satisfies GetFeedHomePublicResponse;
