import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { RoutePlaceholder } from "./route-placeholder";

const meta = {
  title: "Parts/Shell/RoutePlaceholder",
  component: RoutePlaceholder,
  args: {
    activeItemId: "home",
    description: "Browse and join the communities you follow.",
    path: "/communities",
    title: "Communities",
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof RoutePlaceholder>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Scaffolded route",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Communities" })).toBeInTheDocument();
    await expect(canvas.getByText("/communities")).toBeInTheDocument();
  },
};

export const LongDescription: Story = {
  name: "Long description",
  args: {
    description:
      "This route will host the full moderation queue, including reported posts, hidden content, the policy editor, and the audit trail for every action a moderator takes.",
    path: "/c/night-shift/moderation",
    title: "Moderation",
  },
};

export const Mobile: Story = {
  name: "Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
