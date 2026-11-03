import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";
import { ActivityLeaderboard } from "./activity-leaderboard.tsx";
import { streakDependencies } from "./activity-leaderboard-story-fixtures.ts";
const meta = {
  title: "Screens/Rewards/Leaderboard",
  component: ActivityLeaderboard,
  args: { communityId: "community", display: "page", title: "Harbor Collective", backHref: "/c/community", dependencies: streakDependencies() },
  parameters: {
    layout: "fullscreen",
    viewport: { options: {
      boardPhone: { name: "Phone 390", styles: { width: "390px", height: "844px" } },
      boardDesktop: { name: "Desktop 1280", styles: { width: "1280px", height: "1000px" } },
    } },
  },
  globals: { viewport: { value: "boardDesktop", isRotated: false } },
} satisfies Meta<typeof ActivityLeaderboard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Member: Story = { play: async ({ canvasElement }) => { const canvas = within(canvasElement); await expect(await canvas.findByRole("region", { name: "Your streak" })).toBeVisible(); await expect(canvas.getByText("your rank")).toBeVisible(); } };
export const Visitor: Story = { args: { dependencies: streakDependencies("visitor") }, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await expect(await canvas.findByText("harbor.singer")).toBeVisible(); await expect(canvas.queryByRole("region", { name: "Your streak" })).toBeNull(); } };
export const Empty: Story = { args: { dependencies: streakDependencies("empty") }, play: async ({ canvasElement }) => { await expect(await within(canvasElement).findByText("Study or sing here today to be first.")).toBeVisible(); } };
export const Loading: Story = { args: { dependencies: streakDependencies("loading") } };
export const Error: Story = { args: { dependencies: streakDependencies("error") } };
export const NoStreak: Story = { args: { dependencies: streakDependencies("no-streak") } };
export const PrivateProgressError: Story = { args: { dependencies: streakDependencies("private-error") } };
export const TiedRanks: Story = { args: { dependencies: streakDependencies("ties") }, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await canvas.findByText("saltline"); await expect(canvas.getAllByLabelText("Rank 3")).toHaveLength(2); } };
export const PhoneMember: Story = { ...Member, globals: { viewport: { value: "boardPhone", isRotated: false } } };
export const PhoneVisitor: Story = { ...Visitor, globals: { viewport: { value: "boardPhone", isRotated: false } } };
export const PhoneEmpty: Story = { ...Empty, globals: { viewport: { value: "boardPhone", isRotated: false } } };
export const PhoneLoading: Story = { ...Loading, globals: { viewport: { value: "boardPhone", isRotated: false } } };
export const PhoneError: Story = { ...Error, globals: { viewport: { value: "boardPhone", isRotated: false } } };
