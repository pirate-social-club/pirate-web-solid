import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ProfileSettingsReview } from "../profile-page-review-fixtures.tsx";
import { reviewViewports } from "../../shell/media-shell/media-shell-story-fixtures.tsx";

const meta = {
  title: "Compositions/Profiles/ProfilePage",
  parameters: { layout: "fullscreen", viewport: { options: reviewViewports }, a11y: { test: "error" }, docs: { description: { component: "Actual profile page with its shared hero, public activity tabs, post and comment cards. Explicit read and write fixtures exercise the same controls without live requests." } } },
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
    await expect(canvas.getByRole("tab", { name: "Overview" })).toBeVisible();
    await expect(await canvas.findByRole("link", { name: "Settings" })).toBeVisible();
  },
};
export const LiveVisitor: Story = { ...Visitor, render: () => <ProfileSettingsReview live visitor /> };
export const LiveOwnProfileMobile: Story = { ...LiveOwnProfile, globals: { viewport: { value: "mobile1", isRotated: false } } };
export const LiveVisitorMobile: Story = { ...LiveVisitor, globals: { viewport: { value: "mobile1", isRotated: false } } };

export const ActivityTabs: Story = {
  ...Overview,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText("Harbor Lights")).toBeVisible());
    await userEvent.click(canvas.getByRole("tab", { name: "Comments" }));
    await waitFor(() => expect(canvas.getByText("The chorus is a good place to start practising.")).toBeVisible());
    await expect(canvas.queryByText("Harbor Lights")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: "Posts" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Downvote" })).toBeVisible());
    await expect(canvas.queryByText("The chorus is a good place to start practising.")).not.toBeInTheDocument();
  },
};
