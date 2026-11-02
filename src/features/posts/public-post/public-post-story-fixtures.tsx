import type { PublicPostContentResponse, PublicPostRouteState } from "./public-post-route.model";
import type { SessionResolution } from "../../../api/session";
import type { ActivityClient, ActivityLeaderboardData } from "../../activity/activity-api";
import { progressFixture, presentationFixture } from "../../activity/activity-contract-fixtures";
import type { PublicPostSongDependencies } from "./public-post-route-view";

/** Block application requests even when a child catches the resulting error. */
export function postStoryNetworkGuard() {
  let requests: string[] = [];
  return {
    requests: () => requests,
    beforeEach: () => {
      requests = [];
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch")!;
      const original = globalThis.fetch;
      const guarded = Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): ReturnType<typeof fetch> => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
        if (url.pathname.startsWith("/api/")) {
          requests.push(url.pathname);
          return Promise.reject(new Error(`Unexpected post story API request: ${url.pathname}`));
        }
        return original(input, init);
      }, original);
      Object.defineProperty(globalThis, "fetch", { ...descriptor, value: guarded });
      return () => { Object.defineProperty(globalThis, "fetch", descriptor); };
    },
  };
}

/** Each aggregate render controls every song child, including its private reads. */
export function postSongStoryDependencies(
  resolveSession: () => Promise<SessionResolution> = async () => "anonymous",
): PublicPostSongDependencies {
  const board = (communityId: string, postId?: string): ActivityLeaderboardData => ({
    object: "activity_streak_leaderboard",
    scope: postId ? { kind: "song", community_id: communityId, post_id: postId } : { kind: "community", community_id: communityId },
    day_semantics: "account_pinned_iana_timezone_v1", entries: [], viewer_standing: null,
  });
  const client: ActivityClient = {
    get_communitiesCommunityIdPostsPostIdRewardsLeaderboard: async input => board(input.path.communityId, input.path.postId),
    get_communitiesCommunityIdRewardsLeaderboard: async input => board(input.path.communityId),
    get_rewardsQualificationPolicies: async () => ({ policies: [
      { activity: "study", policy: { kind: "study_session_first_pass_v2", qualification_policy_version_id: "study-policy", required_correct_bps: 7000 } },
      { activity: "karaoke", policy: { kind: "karaoke_qualification_v2", qualification_policy_version_id: "karaoke-policy", minimum_scored_line_count: 5, minimum_coverage_bps: 8500, minimum_final_score_bps: 7000, eligible_playback_kinds: ["full_mix", "instrumental"] } },
    ] }),
    put_communitiesCommunityIdRewardsPresentationPersona: async () => { throw new Error("Story does not change presenting profile"); },
  };
  const progress = {
    ...progressFixture,
    week: { ...progressFixture.week, days: progressFixture.week.days.map(day => ({ ...day, earned: false })) },
    activity_counts: progressFixture.activity_counts.map(activity => ({ ...activity, qualification_count: 0 })),
    streak: { current: 0, best: 0, total_days: 0, started_day: null, last_day: null }, standing: null,
  };
  return {
    pool: { pool: async () => null, standing: async () => { throw new Error("Rewards are off in this story"); } },
    participation: { read: async () => null },
    videoEntry: { read: async () => false, sessionHint: () => true, resolveSession },
    activity: {
      client, resolveSession,
      privateClient: {
        get_communitiesCommunityIdPostsPostIdRewardsProgress: async input => ({ ...progress, scope: { kind: "song", community_id: input.path.communityId, post_id: input.path.postId } }),
        get_communitiesCommunityIdRewardsProgress: async input => ({ ...progress, scope: { kind: "community", community_id: input.path.communityId } }),
        get_communitiesCommunityIdRewardsPresentationPersona: async input => ({
          ...presentationFixture, community_id: input.path.communityId,
          selection: { status: "unset" },
        }),
      },
    },
  };
}

export function postStoryState(canonical: boolean): PublicPostRouteState {
  const response: PublicPostContentResponse = {
    kind: "content",
    post_id: "post-1",
    content: {
      post: {
        id: "post-1",
        object: "post", authorship_mode: "human_direct", identity_mode: "public",
        status: "published", visibility: "public", analysis_state: "allow",
        content_safety_state: "safe", age_gate_policy: "none",
        post_type: "text",
        community: "community-story",
        created: 1_790_700_000,
        title: "A searchable title",
        body: "A bounded public description.",
        author_persona: { persona_id: "persona-public-creator", object: "persona", display_name: "Public creator", avatar_ref: null, primary_public_handle: null },
      },
      thread_snapshot: null, like_count: 0, viewer_vote: null, viewer_reaction_kinds: [],
      machine_translated: false, source_hash: null,
      upvote_count: 0,
      downvote_count: 0,
      comment_count: 0,
      resolved_locale: "en",
      translation_state: "same_language",
      translated_title: null,
      translated_body: null,
    },
    route: canonical ? {
      canonical_path: "/posts/a-searchable-title",
      activity_paths: {
        study: "/posts/a-searchable-title/study",
        karaoke: "/posts/a-searchable-title/karaoke",
        karaoke_leaderboard: "/posts/a-searchable-title/karaoke/leaderboard",
      },
    } : null,
  };
  return {
    kind: "content",
    status: 200,
    activity: "detail",
    response,
    canonicalPath: canonical ? "/posts/a-searchable-title" : null,
    canonicalUrl: canonical ? "https://pirate.sc/posts/a-searchable-title" : null,
  };
}

