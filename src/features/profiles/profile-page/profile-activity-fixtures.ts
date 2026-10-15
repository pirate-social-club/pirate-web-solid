import type { GetPublicProfileActivityResponse } from "@pirate/api-client";
import { decodePendingEngagementAction } from "../../posts/post-engagement/post-engagement-pending.ts";
import { createMemoryPendingEngagementStorage } from "../../posts/post-engagement/post-engagement-pending.ts";
import type { PostEngagementTransport } from "../../posts/post-engagement/post-engagement-api.ts";
import type { ProfileActivityDependencies } from "./profile-activity.tsx";

const persona = { persona_id: "owned", object: "persona" as const, display_name: "Owned profile", avatar_ref: "/storybook/karaoke-artwork.svg", primary_public_handle: "owned.pirate" };
const engagement = { thread_snapshot: null, like_count: 0, viewer_vote: null, viewer_reaction_kinds: [], resolved_locale: "en", translation_state: "same_language" as const, machine_translated: false };
const authored = { object: "post" as const, community: "harbor", author_persona: persona, authorship_mode: "human_direct" as const, identity_mode: "public" as const, status: "published" as const, visibility: "public" as const, analysis_state: "allow" as const, content_safety_state: "safe" as const, age_gate_policy: "none" as const };

/**
 * The Paper Profile sheet's feed: a song, a video and a text post, newest
 * first as the server orders them. The comment row is what the server's
 * overview surface would add; the posts feed never asks for it.
 */
export const profileActivityFixture: GetPublicProfileActivityResponse = {
  object: "profile_activity_page",
  next_cursor: null,
  items: [
    {
      kind: "post", activity_id: "profile-story-post", activity_at: "2026-10-05T12:00:00.000000Z", community_id: "harbor", post_id: "profile-story-post", href: "/posts/harbor-lights",
      content: {
        ...engagement,
        post: { ...authored, id: "profile-story-post", post_type: "song", title: null, song_title: "Harbor Lights", body: "Late-night loop, take two.", created: 1791201600 },
        upvote_count: 20, downvote_count: 2, comment_count: 24, source_hash: "profile-story-source",
      },
    },
    {
      kind: "post", activity_id: "profile-story-video", activity_at: "2026-10-05T09:00:00.000000Z", community_id: "harbor", post_id: "profile-story-video", href: "/posts/harbor-lights-video",
      content: {
        ...engagement,
        post: { ...authored, id: "profile-story-video", post_type: "video", title: null, body: null, caption: null, created: 1791190800 },
        video: { track: "video", caption: null, caption_dir: null, caption_lang: null,
          soundtrack: { kind: "song_reference", render_mode: "canonical_replace", song_reference: { song_post_id: "profile-story-post", song_title: "Harbor Lights", song_author_persona_id: "owned" } },
          playback: { status: "ready", provider: "stream", playback_ref: "story-playback" }, thumbnail: { status: "ready", artifact_ref: "story-thumbnail" },
          data_registration: "registered", capabilities: { can_post_with_song: true } },
        upvote_count: 20, downvote_count: 2, comment_count: 24, source_hash: "profile-story-video-source",
      },
    },
    {
      kind: "post", activity_id: "profile-story-text", activity_at: "2026-10-04T12:00:00.000000Z", community_id: "harbor", post_id: "profile-story-text", href: "/posts/weekly-listening-thread",
      content: {
        ...engagement,
        post: { ...authored, id: "profile-story-text", post_type: "text", title: "Weekly listening thread", body: "What have you had on repeat this week?", created: 1791115200 },
        upvote_count: 20, downvote_count: 2, comment_count: 24, source_hash: "profile-story-text-source",
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
