import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { KaraokeLeaderboard } from "./karaoke-leaderboard";
import { storyArtworkSrc, storyEmptyLeaderboard, storyLeaderboard } from "./karaoke-story-fixtures";

const meta = {
  title: "Parts/Karaoke/Leaderboard",
  component: KaraokeLeaderboard,
  parameters: {
    layout: "fullscreen",
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
    title: "Apocalypse Dreams",
    artistName: "Tame Impala",
    artworkSrc: storyArtworkSrc,
    leaderboard: storyLeaderboard,
    onExit: () => {},
    onSing: () => {},
  },
};

export const Empty: Story = {
  args: {
    title: "Apocalypse Dreams",
    artistName: "Tame Impala",
    leaderboard: storyEmptyLeaderboard,
    onExit: () => {},
    onSing: () => {},
  },
};
