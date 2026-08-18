import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { KaraokeLeaderboard } from "./karaoke-leaderboard";
import { storyEmptyLeaderboard, storyLeaderboard } from "./karaoke-story-fixtures";

const meta = {
  title: "Features/Karaoke/Leaderboard",
  component: KaraokeLeaderboard,
  parameters: {
    docs: {
      description: {
        component:
          "Karaoke leaderboard card. Purely prop-driven from the api-next leaderboard contract; loading, error, and auth states are route-level and covered by the route stories.",
      },
    },
  },
} satisfies Meta<typeof KaraokeLeaderboard>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RankedEntries: Story = {
  args: {
    title: "Paper Moon",
    artistName: "The Harborlights",
    leaderboard: storyLeaderboard,
    onExit: () => {},
    onSing: () => {},
  },
};

export const Empty: Story = {
  args: {
    title: "Paper Moon",
    artistName: "The Harborlights",
    leaderboard: storyEmptyLeaderboard,
    onExit: () => {},
    onSing: () => {},
  },
};
