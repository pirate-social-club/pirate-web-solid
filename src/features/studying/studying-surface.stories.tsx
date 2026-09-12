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
          "Every state is injected: the say-it-back phase machine (idle/listening/checking/wrong), " +
          "multiple choice with reveal styling, and completion. Recording, network, " +
          "and timers live at the route-view seam, never in this component. The production v2 client " +
          "never supplies a reward or streak, so no story here depicts one.",
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
      state={state}
      {...extra}
    />
  );
}

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
      lessonProgress: completeProgress,
      onKaraoke: noop,
      onStudyAgain: noop,
    },
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Production completion: both footer actions are present and no reward or streak is claimed.",
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
