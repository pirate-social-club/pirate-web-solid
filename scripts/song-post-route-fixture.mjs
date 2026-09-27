// Local-only fixture for the production slug loader, deliberately not keyed by ID.
export const songPostHref = record =>
  `/posts/fixture-song-${record.submissionId.replace("submission-", "")}`;

export function songPostRouteFixture(record) {
  const postId = `post-${record.submissionId}`;
  const path = songPostHref(record);
  return {
    kind: "content",
    post_id: postId,
    content: {
      post: {
        id: postId, object: "post", post_type: "song", status: "published",
        community: record.communityId, title: record.title, song_title: record.title,
        body: null, visibility: "public", authorship_mode: "human_direct",
        identity_mode: "public", analysis_state: "allow", content_safety_state: "safe",
        age_gate_policy: "none", created: 1_777_000_000,
        author_persona: {
          persona_id: record.personaId, object: "persona",
          display_name: "Song fixture persona", avatar_ref: null,
          primary_public_handle: "song-fixture",
        },
      },
      resolved_locale: "en", translation_state: "same_language",
      translated_title: null, translated_body: null,
      thread_snapshot: null, upvote_count: 0, downvote_count: 0, like_count: 0,
      viewer_vote: null, viewer_reaction_kinds: [], machine_translated: false, source_hash: null,
    },
    route: {
      canonical_path: path,
      activity_paths: {
        study: `${path}/study`, karaoke: `${path}/karaoke`,
        karaoke_leaderboard: `${path}/karaoke/leaderboard`,
      },
    },
  };
}
