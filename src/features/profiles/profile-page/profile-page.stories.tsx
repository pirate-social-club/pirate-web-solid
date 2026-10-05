import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { ProfileSettingsReview } from "../profile-page-review-fixtures.tsx";
import { reviewViewports } from "../../shell/media-shell/media-shell-story-fixtures.tsx";

const meta = {
  title: "Compositions/Profiles/ProfilePage",
  parameters: { layout: "fullscreen", viewport: { options: reviewViewports }, a11y: { test: "error" }, docs: { description: { component: "Solid profile composition with Overview, Posts and Comments. Wallet and Book appear when their panels are supplied. Activity and statistics in these stories are fixtures; production has no activity read yet." } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Overview: Story = { render: () => <ProfileSettingsReview /> };
export const Posts: Story = {
  ...Overview,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Posts" }));
    await expect(canvas.getByRole("heading", { name: "Harbor Lights" })).toBeVisible();
  },
};
export const Comments: Story = {
  ...Overview,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("tab", { name: "Comments" }));
    await expect(canvas.getByRole("heading", { name: "On Open Water" })).toBeVisible();
  },
};
export const Mobile: Story = { ...Overview, globals: { viewport: { value: "mobile1", isRotated: false } } };
