import { describe, expect, test, vi } from "vitest";
import type { GetPublicCommunityThreadsResponse } from "@pirate/api-client";

import {
  fetchCommunityThreadsPage,
  mapCommunityThreadsPage,
} from "./community-threads-adapter.ts";

function response(): GetPublicCommunityThreadsResponse {
  // SAFETY: this fixture contains the generated response fields exercised by the adapter tests.
  return {
    community: {
      id: "com_harbor",
      object: "community_preview",
      route_slug: "harbor",
      display_name: "Harbor",
      description: "Coastal ideas.",
      avatar_ref: null,
      membership_mode: "open",
      human_verification_lane: null,
      membership_gate_summaries: [{ gate_type: "age_over_18" }],
      gate_match_mode: "all",
      rules: [{ id: "rule-1", object: "community_rule", title: "Be useful", body: "Add signal.", report_reason: "off_topic", position: 1, status: "active" }],
      moderators: [],
      member_count: 12,
      follower_count: 34,
      viewer_membership_status: "not_member",
      viewer_following: false,
      created: 1_700_000_000,
    },
    items: [
      {
        post: {
          id: "post-1",
          object: "post",
          community: "com_harbor",
          authorship_mode: "human_direct",
          identity_mode: "anonymous",
          anonymous_label: "Harbor voice",
          post_type: "text",
          status: "published",
          visibility: "public",
          analysis_state: "allow",
          content_safety_state: "safe",
          age_gate_policy: "none",
          title: "First thread",
          body: "A useful beginning.",
          created: 1_700_000_100,
        },
        community: undefined,
        thread_snapshot: null,
        upvote_count: 9,
        downvote_count: 2,
        like_count: 9,
        viewer_vote: null,
        viewer_reaction_kinds: [],
        resolved_locale: "en",
        translation_state: "same_language",
        machine_translated: false,
        source_hash: "hash-1",
      },
    ],
    next_cursor: "cursor-2",
  } as GetPublicCommunityThreadsResponse;
}

describe("community threads adapter", () => {
  test("maps the API envelope to the community page model", () => {
    const page = mapCommunityThreadsPage(response());

    expect(page.community).toMatchObject({
      name: "Harbor",
      handle: "c/harbor",
      description: "Coastal ideas.",
      members: 12,
      followers: 34,
    });
    expect(page.community.posts[0]).toMatchObject({
      id: "post-1",
      title: "First thread",
      body: "A useful beginning.",
      score: 7,
    });
    expect(page.community.gates).toEqual([{ label: "age over 18", status: "unknown" }]);
    expect(page.community.rules).toEqual([{ title: "Be useful", body: "Add signal.", position: 1 }]);
    expect(page.nextCursor).toBe("cursor-2");
    expect(page.joined).toBe(false);
    expect(page.following).toBe(false);
    expect(page.canJoin).toBe(true);
  });

  test("uses the public community threads contract with a fixed thread surface", async () => {
    const getFeed = vi.fn(async () => response());
    const page = await fetchCommunityThreadsPage({
      client: { get_publicCommunitiesCommunityRefFeed: getFeed },
      communityRef: "harbor",
      locale: "en-US",
      cursor: "cursor-1",
    });

    expect(getFeed).toHaveBeenCalledWith({
      path: { communityRef: "harbor" },
      query: { cursor: "cursor-1", locale: "en-US", sort: "new", surface: "threads" },
    });
    expect(page.community.name).toBe("Harbor");
  });
});
