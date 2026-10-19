import { describe, expect, test } from "vitest";

import { toStreamedHomeVideoPost } from "../video-feed/home-video-feed-model";
import { normalizeFeedPage } from "./public-feed-adapter";

/** The viewer's community membership comes from the feed's community
 * preview (`items[].community.viewer_membership_status`); only "member"
 * grants member actions such as Report, and an unknown value grants none. */

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
  object: "community_preview",
  display_name: "Harbor",
  route_slug: "harbor",
  avatar_ref: null,
};

const delivery = { track: "video", playback: { status: "ready" }, thumbnail: { status: "ready" } };

const item = (membership: string | null | undefined) => normalizeFeedPage({
  items: [{
    community: membership === undefined ? community : { ...community, viewer_membership_status: membership },
    post: { post, translation_state: "same_language", video: delivery },
  }],
  top_communities: [],
  next_cursor: null,
}).items[0]!;

describe("the feed's viewer membership projection", () => {
  test("carries each status the contract names", () => {
    expect(item("member").viewerMembershipStatus).toBe("member");
    expect(item("not_member").viewerMembershipStatus).toBe("not_member");
    expect(item("banned").viewerMembershipStatus).toBe("banned");
  });

  test("carries null when the server omits or garbles it", () => {
    expect(item(undefined).viewerMembershipStatus).toBeNull();
    expect(item(null).viewerMembershipStatus).toBeNull();
    expect(item("owner").viewerMembershipStatus).toBeNull();
  });

  test("marks a video post for member actions only for a member", () => {
    const posterPath = (postId: string) => `/poster/${postId}`;
    expect(toStreamedHomeVideoPost(item("member"), posterPath)?.viewerIsMember).toBe(true);
    for (const status of ["not_member", "banned", null, undefined]) {
      expect(toStreamedHomeVideoPost(item(status), posterPath)?.viewerIsMember).toBeUndefined();
    }
  });
});
