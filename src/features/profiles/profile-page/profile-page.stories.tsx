import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, waitFor, within } from "storybook/test";
import { ProfileSettingsReview } from "../profile-page-review-fixtures.tsx";
import { reviewViewports } from "../../shell/media-shell/media-shell-story-fixtures.tsx";
import { reviewCanplayAttach, reviewPlaybackMint, reviewPosterPath } from "../../posts/feed/public-feed-fixtures.ts";
import { VideoPlaybackSeamsContext } from "../../posts/video-submission/video-playback-seams.tsx";
import { profileActivityDependencies } from "./profile-activity-fixtures.ts";
import { ProfileActivity } from "./profile-activity.tsx";
import { ProfileLayout } from "./profile-layout.tsx";

const meta = {
  title: "Screens/Profiles/Profile",
  parameters: { layout: "fullscreen", viewport: { options: reviewViewports }, a11y: { test: "error" }, docs: { description: { component: "Actual profile page (Paper Screens/Profiles/Profile): cover, identity, the viewer's action and one newest-first feed of the profile's posts in the shared post card, with no tabs and no comments. Recorded differences from the sheet: no community line under the label (no profile read projects it), Settings rather than Edit until Edit has a destination, no Get handle, no back or More on the cover, and the four-tab footer. Explicit read and write fixtures exercise the same controls without live requests." } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** The feed holds the sheet's three kinds and nothing else. */
async function expectPostsFeed(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await waitFor(() => expect(canvasElement.querySelectorAll("[data-community-post]")).toHaveLength(3));
  await expect(canvas.getByRole("button", { name: "Play Harbor Lights" })).toBeVisible();
  await expect(canvas.getByRole("link", { name: "Weekly listening thread" })).toBeVisible();
  await expect(canvasElement.querySelector('[data-community-video="profile-story-video"]')).not.toBeNull();
  await expect(canvas.queryByRole("tab")).not.toBeInTheDocument();
  await expect(canvas.queryByText("The chorus is a good place to start practising.")).not.toBeInTheDocument();
  await expect(canvas.queryByRole("button", { name: /^Rewards/ })).not.toBeInTheDocument();
}

export const Overview: Story = { render: () => <ProfileSettingsReview />, play: async ({ canvasElement }) => expectPostsFeed(canvasElement) };
export const Mobile: Story = { ...Overview, globals: { viewport: { value: "mobile1", isRotated: false } } };

export const Visitor: Story = {
  render: () => <ProfileSettingsReview visitor />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    await expectPostsFeed(canvasElement);
  },
};
export const VisitorMobile: Story = { ...Visitor, globals: { viewport: { value: "mobile1", isRotated: false } } };

export const LiveOwnProfile: Story = {
  render: () => <ProfileSettingsReview live />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 1, name: "owned.pirate" })).toBeVisible();
    await expect(await canvas.findByRole("link", { name: "Settings" })).toBeVisible();
    await expectPostsFeed(canvasElement);
  },
};
export const LiveVisitor: Story = { ...Visitor, render: () => <ProfileSettingsReview live visitor /> };
export const LiveOwnProfileMobile: Story = { ...LiveOwnProfile, globals: { viewport: { value: "mobile1", isRotated: false } } };
export const LiveVisitorMobile: Story = { ...LiveVisitor, globals: { viewport: { value: "mobile1", isRotated: false } } };

/** A profile with no handle yet takes its name, or "User" and six characters. */
export const WithoutHandle: Story = {
  render: () => <VideoPlaybackSeamsContext value={{ mint: reviewPlaybackMint, attach: reviewCanplayAttach, posterPath: reviewPosterPath }}>
    <ProfileLayout name="User 4KQ7M2" handle={null} personaId="owned" bio="Songs from the harbor, mostly at night.">
      <ProfileActivity personaId="owned" dependencies={profileActivityDependencies(true)} />
    </ProfileLayout>
  </VideoPlaybackSeamsContext>,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("heading", { level: 1, name: "User 4KQ7M2" })).toBeVisible();
    await expectPostsFeed(canvasElement);
  },
};
