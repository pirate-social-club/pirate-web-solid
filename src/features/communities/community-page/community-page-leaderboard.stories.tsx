import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { CommunityPageShell } from "../../community/page-shell/page-shell.tsx";
import type { CommunityData } from "../../community/page-shell/page-shell-model.ts";
import { ActivityLeaderboard } from "../../activity/activity-leaderboard.tsx";
import { streakDependencies } from "../../activity/activity-leaderboard-story-fixtures.ts";
const leaderboardCommunity: CommunityData = { id: "community", name: "Harbor Collective", handle: "@harbor", description: "Songs, covers and late-night takes from the harbor.", members: 1204, followers: 1400, posts: [], membershipMode: "open", joinRule: { kind: "open" }, rules: [{ title: "Keep it welcoming", body: "Respect every contribution.", position: 1 }] };
const meta = {
  title: "Screens/Community/CommunityPage",
  component: CommunityPageShell,
  args: { community: leaderboardCommunity, following: false, joined: false },
  parameters: {
    layout: "fullscreen",
    viewport: { options: {
      boardPhone: { name: "Phone 390", styles: { width: "390px", height: "844px" } },
      boardDesktop: { name: "Desktop 1280", styles: { width: "1280px", height: "1000px" } },
    } },
  },
  globals: { viewport: { value: "boardDesktop", isRotated: false } },
} satisfies Meta<typeof CommunityPageShell>;
export default meta;
type Story = StoryObj<typeof meta>;


const aboutLeaderboard = () => <ActivityLeaderboard display="preview" communityId="community" href="/c/community/leaderboard" dependencies={streakDependencies()} />;
export const DesktopLeaderboard: Story = { render: () => <CommunityPageShell community={leaderboardCommunity} joined following aboutLeaderboard={aboutLeaderboard} />, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await expect(await canvas.findByText("Your rank: 18")).toBeVisible(); const board = canvasElement.querySelector("[data-leaderboard-card]"); await expect(board?.closest("aside")).not.toBeNull(); await expect(canvasElement.querySelector("[data-community-tabs]")?.previousElementSibling?.querySelector("[data-leaderboard-card]")).toBeNull(); } };
export const PhoneAboutLeaderboard: Story = { globals: { viewport: { value: "boardPhone", isRotated: false } }, render: () => <CommunityPageShell community={leaderboardCommunity} following joined={false} aboutLeaderboard={aboutLeaderboard} />, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole("button", { name: "About" })); await expect(await canvas.findByText("Your rank: 18")).toBeVisible(); } };
export const NationalityAbout: Story = { render: () => <CommunityPageShell community={{ ...leaderboardCommunity, membershipMode: "gated", joinRule: { kind: "nationality", countries: ["PT"] } }} following={false} joined={false} aboutLeaderboard={aboutLeaderboard} /> };
export const PalmAbout: Story = { render: () => <CommunityPageShell community={{ ...leaderboardCommunity, membershipMode: "gated", joinRule: { kind: "palm" } }} following={false} joined={false} aboutLeaderboard={aboutLeaderboard} /> };
