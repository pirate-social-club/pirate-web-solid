/** @jsxImportSource @solidjs/web */
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { ShellStory, creatorNavigation, popularNavigation, reviewViewports } from "../media-shell/media-shell-story-fixtures.tsx";

const meta = {
  title: "Parts/Shell/AppSidebar",
  globals: { viewport: { value: "desktopReview", isRotated: false } },
  parameters: { layout: "fullscreen", viewport: { options: reviewViewports }, a11y: { test: "error" }, docs: { description: { component: "The actual application shell and shared community model, with review fixtures. Live discovery and creator reads are not connected yet." } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <ShellStory communityNavigation={{ kind: "ready", data: creatorNavigation }} /> };
export const Anonymous: Story = { render: () => <ShellStory signedIn={false} communityNavigation={{ kind: "ready", data: popularNavigation }} /> };
export const Member: Story = { render: () => <ShellStory /> };
