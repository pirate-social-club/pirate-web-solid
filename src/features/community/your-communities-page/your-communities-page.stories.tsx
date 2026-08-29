import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Type } from "@pirate/web-solid-ui";
import { YourCommunitiesPageView, type YourCommunitiesPageProps } from "./your-communities-page";

const communities = [{ communityId: "cmt_signal", displayName: "Signal Room", routeSlug: "signal-room", updatedAt: "2026-08-01" }, { communityId: "cmt_tame", displayName: "Tame Impala", routeSlug: "tameimpala", updatedAt: "2026-08-02" }];
function StoryView(props: Omit<YourCommunitiesPageProps, "onCreateCommunity" | "onSelectCommunity">) {
  const [created, setCreated] = createSignal(0);
  const [selected, setSelected] = createSignal("");
  return <div class="min-h-[640px] bg-background text-foreground"><YourCommunitiesPageView {...props} onCreateCommunity={() => setCreated((value) => value + 1)} onSelectCommunity={(community) => setSelected(community.displayName)} /><Type aria-live="polite" class="sr-only" variant="caption">Created {created()} times; selected {selected() || "None"}</Type></div>;
}
const base = { title: "Your communities", createCommunityLabel: "Create community", followingLabel: "Following", joinedLabel: "Joined", emptyFollowingLabel: "You are not following any communities.", emptyJoinedLabel: "You have not joined any communities." };
const meta = { title: "Screens/Community/YourCommunities", component: YourCommunitiesPageView, args: { ...base, followingCommunities: communities, joinedCommunities: [communities[0]!], onCreateCommunity: () => undefined, onSelectCommunity: () => undefined }, parameters: { layout: "fullscreen" } } satisfies Meta<typeof YourCommunitiesPageView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { render: () => <StoryView {...base} followingCommunities={communities} joinedCommunities={[communities[0]!]} />, play: async ({ canvasElement }) => { const canvas = within(canvasElement); const signalRoomButtons = canvas.getAllByRole("button", { name: /Signal Room/ }); await userEvent.click(signalRoomButtons[0]!); await expect(canvas.getByText(/selected Signal Room/)).toBeInTheDocument(); } };
export const Empty: Story = { render: () => <StoryView {...base} followingCommunities={[]} joinedCommunities={[]} /> };
export const MobileTabs: Story = { globals: { viewport: { value: "mobile1", isRotated: false } }, render: () => <StoryView {...base} followingCommunities={communities} joinedCommunities={[]} /> };
export const CreateAction: Story = { render: () => <StoryView {...base} followingCommunities={communities} joinedCommunities={[]} />, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole("button", { name: "Create community" })); await expect(canvas.getByText(/Created 1 times/)).toBeInTheDocument(); } };
