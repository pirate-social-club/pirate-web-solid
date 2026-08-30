import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { KaraokePracticeSurface } from "./karaoke-practice-surface";
import { storyArtworkSrc, storyStageLines } from "./karaoke-story-fixtures";

const meta = {
  title: "Flows/Karaoke/Practice",
  component: KaraokePracticeSurface,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Full-screen karaoke surface matching the reviewed mobile design: the shared activity progress header, an artwork-backed lyric stage, and one full-width action before singing starts. Stories cover the designed states — primed, connecting, active, scoring feedback and ended — and do not touch the mic, WebSocket sessions, or real audio.",
      },
    },
  },
} satisfies Meta<typeof KaraokePracticeSurface>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PublicReadOnly: Story = {
  args: {
    artworkSrc: storyArtworkSrc,
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

export const PausedPrimed: Story = {
  args: {
    artworkSrc: storyArtworkSrc,
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
          "Signed-in, paused before the first line: the cue line is primed and the Start karaoke action is available.",
      },
    },
  },
};

export const ReadyToSing: Story = {
  args: {
    artworkSrc: storyArtworkSrc,
    title: "Paper Moon",
    lines: storyStageLines,
    initialDurationMs: 4800,
    rewardLabel: "$0.40",
    singingStatus: "idle",
    onStartSinging: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "The song is ready to start: the reward milestone is attached to the progress track and the Start karaoke action is available.",
      },
    },
  },
};

export const ScoringFeedback: Story = {
  args: {
    artworkSrc: storyArtworkSrc,
    title: "Paper Moon",
    lines: storyStageLines,
    initialTimeMs: 2550,
    initialDurationMs: 4800,
    rewardLabel: "$0.40",
    rating: {
      key: "line-1:0:0.98",
      label: "Perfect",
      lineId: "line-1",
      points: 50,
      tone: "success",
    },
    ratingPersistent: true,
    singingStatus: "active",
    onStartSinging: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "An active scoring session keeps the latest rating and points visible for review; live sessions use the same feedback as a transient pop.",
      },
    },
  },
};

export const Connecting: Story = {
  args: {
    artworkSrc: storyArtworkSrc,
    title: "Paper Moon",
    lines: storyStageLines,
    rewardLabel: "$0.40",
    singingStatus: "connecting",
    onStartSinging: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "The mic has been granted and the scoring session is still opening; the action shows its busy state and stays disabled.",
      },
    },
  },
};

export const Ended: Story = {
  args: {
    artworkSrc: storyArtworkSrc,
    title: "Paper Moon",
    initialTimeMs: 13600,
    lines: storyStageLines,
    rewardLabel: "$0.40",
    singingStatus: "ended",
    onStartSinging: () => {},
  },
  parameters: {
    docs: {
      description: {
        story: "The take is finished; the action becomes Karaoke again behind a restart mark so the singer can run the song back.",
      },
    },
  },
};
