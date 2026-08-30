import type { Meta, StoryObj } from "storybook-solidjs-vite";

import type { StudyingSurfaceState } from "./studying-model";
import { StudyingSurface, type StudyingSurfaceProps } from "./studying-surface";
import {
  storyMultipleChoiceExercise,
  storySayItBackExercise,
} from "./studying-story-fixtures";

const meta = {
  title: "Flows/Studying/Session",
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

const lessonProgress = { resolvedCount: 1, totalCount: 3 };
const multipleChoiceProgress = { resolvedCount: 2, totalCount: 4 };
const completeProgress = { resolvedCount: 14, totalCount: 14 };
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
  render: surface({ kind: "locked", priceLabel: "$2.00" }, { rewardLabel: undefined }),
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
    heardTranscript: "yo no se por que te fuiste",
    phase: "wrong",
  }),
  parameters: {
    docs: {
      description: {
        story:
          "A retryable miss reports Incorrect and keeps the learner on the same card.",
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
    heardTranscript: "yo no se por que",
    phase: "wrong",
    revealReference: true,
    willReturn: true,
  }),
  parameters: {
    docs: {
      description: {
        story:
          "A spent miss reports Incorrect with the final destructive treatment; the card comes back later in this lesson.",
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
    heardTranscript: "yo no se por que",
    phase: "wrong",
    revealReference: true,
    willReturn: false,
  }),
  parameters: {
    docs: {
      description: {
        story: "The card is spent with nothing left to requeue into; Incorrect is the only feedback copy.",
      },
    },
  },
};

export const MultipleChoiceIdle: Story = {
  render: surface(
    {
      kind: "multiple_choice",
      attemptNumber: 1,
      exercise: { ...storyMultipleChoiceExercise, question: "Translate:" },
    },
    { lessonProgress: multipleChoiceProgress },
  ),
  parameters: {
    docs: {
      description: {
        story: "Unanswered translation-choice card; the server withholds the correct option until an attempt lands.",
      },
    },
  },
};

export const MultipleChoiceSelected: Story = {
  render: surface(
    {
      kind: "multiple_choice",
      attemptNumber: 1,
      exercise: storyMultipleChoiceExercise,
      selectedOptionId: "opt-a",
      submitting: true,
    },
    { lessonProgress: multipleChoiceProgress },
  ),
  parameters: {
    docs: {
      description: {
        story: "A tap submits immediately; options lock while the attempt is recorded, with no Check step.",
      },
    },
  },
};

export const MultipleChoiceCorrect: Story = {
  render: surface(
    {
      kind: "multiple_choice",
      attemptNumber: 1,
      exercise: { ...storyMultipleChoiceExercise, correctOptionId: "opt-a" },
      result: "correct",
      selectedOptionId: "opt-a",
    },
    { lessonProgress: multipleChoiceProgress },
  ),
  parameters: {
    docs: {
      description: {
        story: "Correct reveal; the route auto-advances after a short highlight, no banner.",
      },
    },
  },
};

export const MultipleChoiceWrong: Story = {
  render: surface(
    {
      kind: "multiple_choice",
      attemptNumber: 1,
      exercise: { ...storyMultipleChoiceExercise, correctOptionId: "opt-a" },
      result: "wrong",
      selectedOptionId: "opt-c",
      canRetry: true,
    },
    { lessonProgress: multipleChoiceProgress },
  ),
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
      correctCount: 12,
      scorePercent: 86,
      totalCount: 14,
    },
    {
      completeActionLabel: "Done",
      lessonProgress: completeProgress,
      onPrimaryAction: noop,
      rewardSlot: (
        <div class="mx-2 min-h-[74px] rounded-[var(--radius-xl)] bg-[#202326] px-4 py-3">
          <p class="text-xs text-muted-foreground">Rewards earned</p>
          <div class="mt-2 flex flex-wrap gap-2">
            <span class="rounded-full border border-warning bg-background px-2 py-0.5 text-xs font-semibold text-warning">◉ +$0.30</span>
            <span class="rounded-full border border-warning bg-background px-2 py-0.5 text-xs font-semibold text-warning">▣ Lotto ticket</span>
          </div>
        </div>
      ),
    },
  ),
  parameters: {
    docs: {
      description: {
        story: "Session complete without a streak qualification; the score, correct count, and earned rewards stay together.",
      },
    },
  },
};

export const CompleteStreakQualified: Story = {
  render: surface(
    {
      kind: "complete",
      correctCount: 12,
      nextReviewLabel: "tomorrow",
      previousStreak: 7,
      scorePercent: 100,
      streak: {
        currentStreak: 7,
        qualifiedToday: true,
        studyAttemptsToday: 14,
        studyCorrectCount: 12,
        studyTargetCount: 10,
      },
      streakWeek: [true, true, true, true, false, false, false],
      totalCount: 14,
    },
    { completeActionLabel: "Done", lessonProgress: completeProgress, onPrimaryAction: noop },
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Streak-qualified completion: the streak total and weekday progress sit above the single Done action.",
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
      rewardLabel: undefined,
      rewardSlot: (
        <div class="mx-2 min-h-[74px] rounded-[var(--radius-xl)] bg-[#202326] px-4 py-3 text-center">
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
