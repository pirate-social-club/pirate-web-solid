import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { CommunityPageShell } from "./page-shell";

const meta = {
  title: "Screens/Community/SongPlayback",
  component: CommunityPageShell,
  render: args => <CommunityPageShell {...args} />,
  parameters: { layout: "fullscreen" },
  args: {
    community: {
      name: "Night Shift", handle: "c/night-shift", description: "Original recordings.",
      members: 12, followers: 24,
      posts: [{ id: "song-playback-layout", kind: "song", title: "Midnight Waves",
        mediaTitle: "Midnight Waves", body: "", score: 0, publishedAt: "2026-10-07" }],
    },
    following: true,
    joined: true,
  },
} satisfies Meta<typeof CommunityPageShell>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = { name: "Desktop song controls" };
export const Mobile: Story = {
  name: "Mobile song controls",
  globals: { viewport: { value: "mobile1", isRotated: false } },
};
