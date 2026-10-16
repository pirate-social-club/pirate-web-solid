import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";
import { privateFixtureClient, presentationFixture } from "./activity-contract-fixtures.ts";
import type { AuthenticatedSession } from "../../api/session.ts";
import type { ActivityClient, ActivityLeaderboardData } from "./activity-api.ts";
import { ActivityLeaderboard } from "./activity-leaderboard.tsx";

const entry: ActivityLeaderboardData["entries"][number] = {
  rank: 1, current: 3, best: 6, total_days: 9, started_day: "2026-10-14", last_day: "2026-10-16",
  persona: { object: "persona", persona_id: "community-profile", display_name: "Community singer", avatar_ref: null, primary_public_handle: null }, is_viewer: true,
};
const board: ActivityLeaderboardData = {
  object: "activity_streak_leaderboard", scope: { kind: "song", community_id: "community", post_id: "song" }, day_semantics: "account_pinned_iana_timezone_v1", entries: [entry], viewer_standing: entry,
};
const session: AuthenticatedSession = { status: "authenticated", userId: "story-account", personas: [
  { personaId: "community-profile", displayName: "Community singer", avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId: "community", bindingSource: "activity_participation" } },
  { personaId: "second-profile", displayName: "Second profile", avatarRef: null, primaryPublicHandle: null, communityBinding: { communityId: "community", bindingSource: "activity_participation" } },
] };
function client(result: ActivityLeaderboardData = board): ActivityClient {
  return {
    get_communitiesCommunityIdPostsPostIdRewardsLeaderboard: async () => result,
    get_communitiesCommunityIdRewardsLeaderboard: async () => ({ ...result, scope: { kind: "community", community_id: "community" } }),
    get_rewardsQualificationPolicies: async () => ({ policies: [
      { activity: "study", policy: { kind: "study_session_first_pass_v2", qualification_policy_version_id: "study-policy", required_correct_bps: 7000 } },
      { activity: "karaoke", policy: { kind: "karaoke_qualification_v2", qualification_policy_version_id: "karaoke-policy", minimum_scored_line_count: 5, minimum_coverage_bps: 8500, minimum_final_score_bps: 7000, eligible_playback_kinds: ["full_mix", "instrumental"] } },
    ] }),
    put_communitiesCommunityIdRewardsPresentationPersona: async input => ({ object: "activity_presentation", community_id: input.path.communityId, persona_id: input.body.persona_id, updated_at: "2026-10-16T00:00:00Z" }),
  };
}
const meta = {
  title: "Parts/Activity/StreakLeaderboard", component: ActivityLeaderboard,
  args: { communityId: "community", postId: "song", dependencies: { client: client(), resolveSession: async () => session } },
  parameters: { layout: "padded", a11y: { test: "error" } },
  render: args => <div class="mx-auto max-w-xl"><ActivityLeaderboard {...args} dependencies={{ ...args.dependencies, privateClient: { ...privateFixtureClient(), get_communitiesCommunityIdRewardsPresentationPersona: async () => ({ ...presentationFixture, selection: { status: "selected", presentation: { object: "activity_presentation", community_id: "community", persona_id: "community-profile", updated_at: "2026-10-16T00:00:00Z" } } }) } }} /></div>,
} satisfies Meta<typeof ActivityLeaderboard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SongStanding: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Your standing")).toBeVisible();
    await expect(await canvas.findByText(/Study: 70%/)).toBeVisible();
  },
};
export const Anonymous: Story = { args: { dependencies: { client: client(), resolveSession: async () => "anonymous" } }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await expect(await canvas.findByText(/Sign in to see/)).toBeVisible();
  await expect(canvas.queryByText("Your standing")).toBeNull();
} };
export const Community: Story = { args: { postId: undefined, compact: true }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement); await expect(await canvas.findByText("Your streak: 3 days")).toBeVisible();
} };
export const Empty: Story = { args: { dependencies: { client: client({ ...board, entries: [], viewer_standing: null }), resolveSession: async () => session } }, play: async ({ canvasElement }) => {
  await expect(await within(canvasElement).findByText("No active streaks yet.")).toBeVisible();
} };
export const Loading: Story = { args: { dependencies: { client: client(), resolveSession: () => new Promise(() => {}) } } };
export const ReadError: Story = { args: { dependencies: { client: { ...client(), get_communitiesCommunityIdPostsPostIdRewardsLeaderboard: async () => { throw new Error("fixture unavailable"); } }, resolveSession: async () => session } }, play: async ({ canvasElement }) => {
  await expect(await within(canvasElement).findByText("Couldn't load streaks.")).toBeVisible();
} };
export const SessionError: Story = { args: { dependencies: { client: client(), resolveSession: async () => { throw new Error("fixture session unavailable"); } } } };
export const ProfilesUnavailable: Story = { args: { dependencies: { client: client(), resolveSession: async () => ({ ...session, personas: [], personasUnavailable: true }) } } };
export const RequirementsUnavailable: Story = { args: { dependencies: { client: { ...client(), get_rewardsQualificationPolicies: async () => { throw new Error("fixture requirements unavailable"); } }, resolveSession: async () => session } } };
