import type { ActivityCompletionData, ActivityPresentationData, ActivityProgressData, PrivateActivityClient } from "./activity-private-api.ts";

export const progressFixture: ActivityProgressData = {
  object: "activity_progress", scope: { kind: "song", community_id: "community", post_id: "song" }, observed_at: "2026-10-16T12:00:00Z",
  day_semantics: "account_pinned_iana_timezone_v1", timezone: "America/New_York", timezone_pinned: true, today: "2026-10-16",
  week: { start_day: "2026-10-12", end_day: "2026-10-18", days: [
    { day: "2026-10-12", earned: false }, { day: "2026-10-13", earned: false }, { day: "2026-10-14", earned: true },
    { day: "2026-10-15", earned: true }, { day: "2026-10-16", earned: true }, { day: "2026-10-17", earned: false }, { day: "2026-10-18", earned: false },
  ] }, counting_period: "all_recorded_qualifications", activity_counts: [{ activity: "study", qualification_count: 7 }, { activity: "karaoke", qualification_count: 5 }],
  streak: { current: 3, best: 8, total_days: 12, started_day: "2026-10-14", last_day: "2026-10-16" }, standing: { rank: 27, persona_id: "public-profile" },
};
export const presentationFixture: ActivityPresentationData = { object: "activity_presentation_state", community_id: "community", observed_at: "2026-10-16T12:00:00Z", selection: {
  status: "selected", presentation: { object: "activity_presentation", community_id: "community", persona_id: "public-profile", updated_at: "2026-10-16T00:00:00Z" },
} };
export function privateFixtureClient(): PrivateActivityClient {
  return {
    get_communitiesCommunityIdPostsPostIdRewardsProgress: async input => ({ ...progressFixture, scope: { kind: "song", community_id: input.path.communityId, post_id: input.path.postId } }),
    get_communitiesCommunityIdRewardsProgress: async input => ({ ...progressFixture, scope: { kind: "community", community_id: input.path.communityId } }),
    get_communitiesCommunityIdRewardsPresentationPersona: async input => ({ ...presentationFixture, community_id: input.path.communityId, selection: { ...presentationFixture.selection } }),
  };
}
export const completionFixture: ActivityCompletionData = {
  object: "activity_completion", community_id: "community", post_id: "song", persona_id: "public-profile", audio_revision: 1,
  attempt: { kind: "study", session_id: "study-session" }, timezone: "America/New_York", day_semantics: "account_pinned_iana_timezone_v1", observed_at: "2026-10-16T12:00:00Z",
  decision: { status: "qualified", qualification_id: "qualification-1", qualification_policy_version_id: "study-policy", qualified_at: "2026-10-16T12:00:00Z", streak_day: "2026-10-16",
    earned_day: { status: "recorded", signal_id: "earned-signal-1", song_day_newly_earned: true, community_day_newly_earned: false } },
};
