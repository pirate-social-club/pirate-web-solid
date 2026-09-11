import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";

import { RoutePlaceholder } from "./route-placeholder";

const meta = {
  title: "Parts/Shell/RoutePlaceholder",
  component: RoutePlaceholder,
  args: {
    description: "Search across songs, videos, and communities.",
    path: "/search",
    title: "Search",
  },
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
} satisfies Meta<typeof RoutePlaceholder>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Scaffolded route",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Search" })).toBeInTheDocument();
    await expect(canvas.getByText("/search")).toBeInTheDocument();
  },
};

export const Mobile: Story = {
  name: "Mobile",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
