import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";
import { ProfileSettingsReview } from "../profile-page-review-fixtures.tsx";
import { reviewViewports } from "../../shell/media-shell/media-shell-story-fixtures.tsx";

const meta = {
  title: "Compositions/Profiles/ProfilePage",
  parameters: { layout: "fullscreen", viewport: { options: reviewViewports }, a11y: { test: "error" }, docs: { description: { component: "Shared live profile hero and bio with explicit owner or visitor fixtures. Activity previews are paused in the separate shared-component lane until staging acceptance and a profile activity read exist." } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Overview: Story = { render: () => <ProfileSettingsReview /> };
export const Mobile: Story = { ...Overview, globals: { viewport: { value: "mobile1", isRotated: false } } };

export const Visitor: Story = { render: () => <ProfileSettingsReview visitor />, play: async ({ canvasElement }) => { await expect(within(canvasElement).queryByRole("link", { name: "Settings" })).not.toBeInTheDocument(); } };
export const VisitorMobile: Story = { ...Visitor, globals: { viewport: { value: "mobile1", isRotated: false } } };

export const LiveOwnProfile: Story = {
  render: () => <ProfileSettingsReview live />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("tab")).not.toBeInTheDocument();
    await expect(await canvas.findByRole("link", { name: "Settings" })).toBeVisible();
  },
};
export const LiveVisitor: Story = { ...Visitor, render: () => <ProfileSettingsReview live visitor /> };
export const LiveOwnProfileMobile: Story = { ...LiveOwnProfile, globals: { viewport: { value: "mobile1", isRotated: false } } };
export const LiveVisitorMobile: Story = { ...LiveVisitor, globals: { viewport: { value: "mobile1", isRotated: false } } };
