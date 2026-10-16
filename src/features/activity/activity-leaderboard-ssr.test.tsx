import { renderToString } from "@solidjs/web";
import { expect, test, vi } from "vitest";
import { ActivityLeaderboard } from "./activity-leaderboard.tsx";
import { ActivityCompletion } from "./activity-completion.tsx";

test.each([undefined, "song"])("%s leaderboard SSR is a deterministic shell without private, session or client reads", postId => {
  const session = vi.fn(); const read = vi.fn(); const write = vi.fn(); const policies = vi.fn();
  const html = renderToString(() => <ActivityLeaderboard communityId="community" postId={postId} dependencies={{ resolveSession: session, client: {
    get_communitiesCommunityIdPostsPostIdRewardsLeaderboard: read, get_communitiesCommunityIdRewardsLeaderboard: read,
    put_communitiesCommunityIdRewardsPresentationPersona: write, get_rewardsQualificationPolicies: policies,
  } }} />);
  expect(html).toContain("Loading streaks"); expect(html).not.toContain("Your standing"); expect(html).not.toContain("Presenting as");
  expect(html).not.toContain("0 days"); expect(session).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(policies).not.toHaveBeenCalled();
});

test.each(["study", "karaoke"] as const)("%s completion SSR exposes neither private facts nor a client/session request", kind => {
  const session = vi.fn(); const read = vi.fn();
  const html = renderToString(() => <ActivityCompletion communityId="community" postId="song" personaId="profile" ownerAccountId="private-account" attempt={kind === "study" ? { kind, session_id: "session" } : { kind, session_id: "session", attempt_id: "attempt" }} dependencies={{ resolveSession: session, client: { get_communitiesCommunityIdStudyV2SessionsSessionIdCompletion: read, get_communitiesCommunityIdKaraokeSessionsSessionIdAttemptsAttemptIdCompletion: read } }} />);
  expect(html).toContain("Checking this attempt"); expect(html).not.toContain("private-account"); expect(html).not.toContain("streak_day"); expect(html).not.toContain("data-earned-day-event");
  expect(session).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
});
