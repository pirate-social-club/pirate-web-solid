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
          "Full-screen karaoke surface matching the reviewed mobile design: the shared activity progress header, an artwork-backed lyric stage, and one full-width action before singing starts. Stories cover the designed states — primed, connecting, active, scoring feedback and ended — and do not touch the mic, WebSocket sessions, or real audio. The production route never supplies a reward label, so no story here shows the gift badge.",
      },
    },
  },
} satisfies Meta<typeof KaraokePracticeSurface>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NotScorable: Story = {
  args: {
    artworkSrc: storyArtworkSrc,
    title: "Paper Moon",
    lines: storyStageLines,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A song with no scorable lines: lyrics render with no singing affordance. Signed-out visitors get the Start action instead.",
      },
    },
  },
};

export const PausedPrimed: Story = {
  args: {
    artworkSrc: storyArtworkSrc,
    title: "Paper Moon",
    lines: storyStageLines,
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

export const ScoringFeedback: Story = {
  args: {
    artworkSrc: storyArtworkSrc,
    title: "Paper Moon",
    lines: storyStageLines,
    initialTimeMs: 2550,
    initialDurationMs: 4800,
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
