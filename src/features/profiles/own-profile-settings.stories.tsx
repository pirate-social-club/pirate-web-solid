import { expect, userEvent, within } from "storybook/test";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ProfileSettingsReview } from "./profile-page-review-fixtures.tsx";

const meta = { title: "Screens/Profile/Account access", parameters: { layout: "fullscreen", a11y: { test: "error" } } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const OwnProfileSettings: Story = {
  render: () => <ProfileSettingsReview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("tab")).not.toBeInTheDocument();
    await userEvent.click(await canvas.findByRole("link", { name: "Settings" }));
    await expect(await canvas.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Switch profile" })).toBeInTheDocument();
  },
};

export const ProfileHeader: Story = {
  name: "Profile page",
  render: () => <ProfileSettingsReview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Owned profile" })).toBeVisible();
    await expect(canvas.getByText("Songs, community sessions and late-night listening.")).toBeVisible();
    await expect(canvas.queryByRole("tab")).not.toBeInTheDocument();
  },
};
