import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { KaraokePracticeSurface } from "./karaoke-practice-surface";
import { storyStageLines } from "./karaoke-story-fixtures";

const meta = {
  title: "Features/Karaoke/PracticeSurface",
  component: KaraokePracticeSurface,
  parameters: {
    docs: {
      description: {
        component:
          "Full-screen karaoke surface matching the activity layout: a reusable progress/reward header, lyric stage, and a single full-width singing action in the footer. Stories do not touch the mic, WebSocket sessions, or real audio.",
      },
    },
  },
} satisfies Meta<typeof KaraokePracticeSurface>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PublicReadOnly: Story = {
  args: {
    title: "Paper Moon",
    lines: storyStageLines,
  },
  parameters: {
    docs: {
      description: {
        story:
          "Signed-out visitor on a public song: timed lyrics render as a read-only surface with no singing affordance.",
      },
    },
  },
};

export const EmptyNoTimedLyrics: Story = {
  args: {
    title: "Paper Moon",
    lines: [],
  },
  parameters: {
    docs: {
      description: {
        story: "The song has no timed karaoke lines; the surface shows the empty state instead of the lyric stage.",
      },
    },
  },
};

export const PausedPrimed: Story = {
  args: {
    title: "Paper Moon",
    lines: storyStageLines,
    rewardLabel: "$0.40",
    singingStatus: "idle",
    onStartSinging: () => {},
  },
  parameters: {
    docs: {
      description: {
        story:
          "Signed-in, paused before the first line: the cue line is primed and the Start singing action is available.",
      },
    },
  },
};

export const ReadyToSing: Story = {
  args: {
    title: "Paper Moon",
    lines: storyStageLines,
    rewardLabel: "$0.40",
    singingStatus: "active",
    onStartSinging: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "A scoring session is live; the singing button flips to its disabled Listening state.",
      },
    },
  },
};

export const ScoringFeedback: Story = {
  args: {
    title: "Paper Moon",
    lines: storyStageLines,
    rating: {
      key: "line-1:0:0.84",
      label: "Good",
      lineId: "line-1",
      points: 84,
      tone: "warning",
    },
    singingStatus: "active",
    onStartSinging: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "Live scoring feedback appears above the lyric stage as a rating and points earned for the latest line. The rating pop fades after about 2 seconds; reload the story to replay it.",
      },
    },
  },
};
