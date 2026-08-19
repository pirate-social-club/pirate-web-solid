import type { Meta, StoryObj } from "storybook-solidjs-vite";

import type { StudyingSurfaceState } from "../studying-model";
import { StudyingSurface, type StudyingSurfaceProps } from "../studying-surface";
import {
  storyMultipleChoiceExercise,
  storySayItBackExercise,
} from "../studying-story-fixtures";

const meta = {
  title: "App/Studying/Surface",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Presentational studying activity surface, ported from the legacy React `SongStudySurface`. " +
          "Every state is injected: locked, the say-it-back phase machine (idle/listening/checking/wrong), " +
          "multiple choice with reveal styling, and the completion/reward variants. Recording, network, " +
          "and timers live at the route-view seam, never in this component.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const lessonProgress = { resolvedCount: 1, totalCount: 4 };
const noop = () => {};

function surface(state: StudyingSurfaceState, extra: Partial<StudyingSurfaceProps> = {}) {
  return () => (
    <StudyingSurface
      lessonProgress={lessonProgress}
      onExit={noop}
      onOptionSelect={noop}
      onPrimaryAction={noop}
      rewardLabel="+25 $MOON"
      state={state}
      {...extra}
    />
  );
}

export const Locked: Story = {
  render: surface({ kind: "locked", priceLabel: "$1.50" }),
  parameters: {
    docs: {
      description: {
        story:
          "Study follows the song's access rules: without ownership the lesson stays locked and the footer offers the purchase.",
      },
    },
  },
};

export const LockedWithoutPrice: Story = {
  render: surface({ kind: "locked" }),
};

export const SayItBackIdle: Story = {
  render: surface({
    kind: "say_it_back",
    attemptNumber: 1,
    exercise: storySayItBackExercise,
    phase: "idle",
  }),
  parameters: {
    docs: {
      description: {
        story: "First appearance of a say-it-back card, ready to record.",
      },
    },
  },
};

export const SayItBackListening: Story = {
  render: surface({
    kind: "say_it_back",
    attemptNumber: 1,
    exercise: storySayItBackExercise,
    phase: "listening",
  }),
  parameters: {
    docs: {
      description: {
        story: "Mic capture in progress; the footer flips to a secondary Stop action.",
      },
    },
  },
};

export const SayItBackChecking: Story = {
  render: surface({
    kind: "say_it_back",
    attemptNumber: 1,
    exercise: storySayItBackExercise,
    phase: "checking",
  }),
  parameters: {
    docs: {
      description: {
        story: "The recording is uploaded and scored; the footer is disabled while the attempt is in flight.",
      },
    },
  },
};

export const SayItBackWrongRetryable: Story = {
  render: surface({
    kind: "say_it_back",
    attemptNumber: 1,
    attemptsThisAppearance: 1,
    exercise: storySayItBackExercise,
    heardTranscript: "Sail the way with me tonight",
    phase: "wrong",
  }),
  parameters: {
    docs: {
      description: {
        story:
          "A retryable miss stays muted and shows only what speech-to-text heard — the prompt already is the expected answer.",
      },
    },
  },
};

export const SayItBackWrongSpentWillReturn: Story = {
  render: surface({
    kind: "say_it_back",
    attemptNumber: 2,
    attemptsThisAppearance: 2,
    exercise: storySayItBackExercise,
    heardTranscript: "Sail the way with me tonight",
    phase: "wrong",
    revealReference: true,
    willReturn: true,
  }),
  parameters: {
    docs: {
      description: {
        story:
          "Per-appearance attempts are spent, so the miss is final (destructive) and the card comes back later in this lesson.",
      },
    },
  },
};

export const SayItBackWrongSpentFinal: Story = {
  render: surface({
    kind: "say_it_back",
    attemptNumber: 3,
    attemptsThisAppearance: 2,
    exercise: storySayItBackExercise,
    heardTranscript: "Sail the way with me tonight",
    phase: "wrong",
    revealReference: true,
    willReturn: false,
  }),
  parameters: {
    docs: {
      description: {
        story: "The card is spent with nothing left to requeue into; the copy must not promise a return.",
      },
    },
  },
};

export const MultipleChoiceIdle: Story = {
  render: surface({
    kind: "multiple_choice",
    attemptNumber: 1,
    exercise: storyMultipleChoiceExercise,
  }),
  parameters: {
    docs: {
      description: {
        story: "Unanswered translation-choice card; the server withholds the correct option until an attempt lands.",
      },
    },
  },
};

export const MultipleChoiceSelected: Story = {
  render: surface({
    kind: "multiple_choice",
    attemptNumber: 1,
    exercise: storyMultipleChoiceExercise,
    selectedOptionId: "opt-a",
    submitting: true,
  }),
  parameters: {
    docs: {
      description: {
        story: "Selection submitted; options lock while the attempt is recorded.",
      },
    },
  },
};

export const MultipleChoiceCorrect: Story = {
  render: surface({
    kind: "multiple_choice",
    attemptNumber: 1,
    exercise: { ...storyMultipleChoiceExercise, correctOptionId: "opt-a" },
    result: "correct",
    selectedOptionId: "opt-a",
  }),
  parameters: {
    docs: {
      description: {
        story: "Correct reveal; the route auto-advances after a short highlight, no banner.",
      },
    },
  },
};

export const MultipleChoiceWrong: Story = {
  render: surface({
    kind: "multiple_choice",
    attemptNumber: 1,
    exercise: { ...storyMultipleChoiceExercise, correctOptionId: "opt-a" },
    result: "wrong",
    selectedOptionId: "opt-b",
  }),
  parameters: {
    docs: {
      description: {
        story: "Wrong reveal shows both the missed selection and the disclosed correct option.",
      },
    },
  },
};

export const MultipleChoiceSubmitError: Story = {
  render: surface({
    kind: "multiple_choice",
    attemptNumber: 1,
    exercise: storyMultipleChoiceExercise,
    submitError: "Could not record this answer. Try again.",
  }),
};

export const Complete: Story = {
  render: surface(
    {
      kind: "complete",
      correctCount: 7,
      scorePercent: 87.5,
      totalCount: 8,
    },
    { onStudyAgain: noop, onKaraoke: noop },
  ),
  parameters: {
    docs: {
      description: {
        story: "Session complete without a streak qualification; footer offers Study again / Karaoke.",
      },
    },
  },
};

export const CompleteStreakQualified: Story = {
  render: surface(
    {
      kind: "complete",
      correctCount: 8,
      nextReviewLabel: "tomorrow",
      previousStreak: 4,
      scorePercent: 100,
      streak: {
        currentStreak: 5,
        qualifiedToday: true,
        studyAttemptsToday: 8,
        studyCorrectCount: 8,
        studyTargetCount: 10,
      },
      totalCount: 8,
    },
    { onStudyAgain: noop },
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Streak-qualified completion: the slot number rolls from the pre-session snapshot to the new streak, with the first-pass score below.",
      },
    },
  },
};

export const CompleteWithRewardSlot: Story = {
  render: surface(
    {
      kind: "complete",
      correctCount: 6,
      scorePercent: 75,
      totalCount: 8,
    },
    {
      onKaraoke: noop,
      rewardSlot: (
        <div class="rounded-[var(--radius-xl)] border border-warning/30 bg-warning/10 px-4 py-3 text-center">
          <span class="font-semibold text-warning">+25 $MOON earned for today's session</span>
        </div>
      ),
    },
  ),
  parameters: {
    docs: {
      description: {
        story: "Completion reward variant: the campaign reward renders below the header instead of in the progress capsule.",
      },
    },
  },
};

export const NoReward: Story = {
  render: () => (
    <StudyingSurface
      lessonProgress={lessonProgress}
      onExit={noop}
      onPrimaryAction={noop}
      state={{
        kind: "say_it_back",
        attemptNumber: 1,
        exercise: storySayItBackExercise,
        phase: "idle",
      }}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Without an active campaign the header capsule holds only the progress bar.",
      },
    },
  },
};
