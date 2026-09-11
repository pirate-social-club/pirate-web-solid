import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { LegalPlaceholderPage } from "./legal-placeholder-page";

const meta = {
  title: "Screens/Legal/LegalPlaceholder",
  component: LegalPlaceholderPage,
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof LegalPlaceholderPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** `/terms` as the router renders it until approved copy replaces the component. */
export const Terms: Story = {
  args: { path: "/terms", title: "Terms" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Terms", level: 1 })).toBeInTheDocument();
    await expect(canvas.getByText("Pre-live placeholder")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in",
    );
  },
};

/** `/privacy` renders the same placeholder under its own path and title. */
export const PrivacyPolicy: Story = {
  args: { path: "/privacy", title: "Privacy Policy" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Privacy Policy", level: 1 })).toBeInTheDocument();
  },
};
