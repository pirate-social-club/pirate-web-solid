import type { GetPublicProfileActivityResponse } from "@pirate/api-client";
import { decodePendingEngagementAction } from "../../posts/post-engagement/post-engagement-pending.ts";
import { createMemoryPendingEngagementStorage } from "../../posts/post-engagement/post-engagement-pending.ts";
import type { PostEngagementTransport } from "../../posts/post-engagement/post-engagement-api.ts";
import type { ProfileActivityDependencies } from "./profile-activity.tsx";

const persona = { persona_id: "owned", object: "persona" as const, display_name: "Owned profile", avatar_ref: "/storybook/karaoke-artwork.svg", primary_public_handle: "owned.pirate" };
export const profileActivityFixture: GetPublicProfileActivityResponse = {
  object: "profile_activity_page",
  next_cursor: null,
  items: [
    {
      kind: "post", activity_id: "profile-story-post", activity_at: "2026-10-05T12:00:00.000000Z", community_id: "harbor", post_id: "profile-story-post", href: "/posts/harbor-lights",
      content: {
        post: { id: "profile-story-post", object: "post", community: "harbor", author_persona: persona, authorship_mode: "human_direct", identity_mode: "public", post_type: "text", status: "published", visibility: "public", title: "Harbor Lights", body: "A new song for our next listening session.", analysis_state: "allow", content_safety_state: "safe", age_gate_policy: "none", created: 1791201600 },
        thread_snapshot: null, upvote_count: 4, downvote_count: 1, like_count: 0, comment_count: 2, viewer_vote: null, viewer_reaction_kinds: [], resolved_locale: "en", translation_state: "same_language", machine_translated: false, source_hash: "profile-story-source",
      },
    },
    {
      kind: "comment", activity_id: "profile-story-comment", activity_at: "2026-10-05T11:00:00.000000Z", community_id: "night-shift", community_name: "Night Shift", post_id: "open-water", post_title: "Open Water", href: "/posts/open-water",
      comment: { comment_id: "profile-story-comment", parent_comment_id: null, body: "The chorus is a good place to start practising.", author_persona: persona, depth: 0, reply_count: 2, status: "published", content_rating: "general", created_at: "2026-10-05T11:00:00Z" },
    },
  ],
};

/** Explicit Storybook transport. These controls never send live writes. */
function fixtureTransport(): PostEngagementTransport {
  const unsupported = async (): Promise<never> => { throw new Error("This story does not perform that command"); };
  return {
    createComment: unsupported, createReply: unsupported, reportComment: unsupported,
    readModerationCase: unsupported, moderateCase: unsupported, readSubmission: unsupported,
    reportPost: async () => ({ report_id: "story-report", case_ref: "story-case", status: "open" }),
    castVote: async envelope => {
      const action = await decodePendingEngagementAction(envelope);
      if (action.kind !== "vote") throw new Error("Expected vote");
      return { post_id: action.postId, value: action.value };
    },
    clearVote: async envelope => {
      const action = await decodePendingEngagementAction(envelope);
      if (action.kind !== "clear_vote") throw new Error("Expected clear vote");
      return { post_id: action.postId, value: 0 };
    },
  };
}

export function profileActivityDependencies(visitor: boolean): ProfileActivityDependencies {
  const session = async () => visitor ? "anonymous" as const : { status: "authenticated" as const, userId: "profile-story-viewer", personas: [{ personaId: "owned", displayName: "Owned profile", avatarRef: null, primaryPublicHandle: "owned.pirate", communityBinding: null }] };
  return {
    resolveSession: session,
    client: { get_publicPersonasPersonaIdActivity: async input => ({
      ...profileActivityFixture,
      items: profileActivityFixture.items.filter(item => input.query?.surface !== "posts" && input.query?.surface !== "comments" || item.kind === (input.query.surface === "posts" ? "post" : "comment")),
    }) },
    engagement: { resolveSession: session, readViewerVote: async () => null, transport: fixtureTransport(), readComments: async () => ({ items: [], next_cursor: null }), pendingStorage: createMemoryPendingEngagementStorage() },
  };
}
