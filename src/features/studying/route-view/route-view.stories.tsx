import type { Meta, StoryObj } from "storybook-solidjs-vite";

import { StudyingRouteView } from "../studying-route-view";
import {
  createAuthRequiredClient,
  createFailingClient,
  createStoryLessonClient,
  createStoryRecorder,
  storyPostId,
  storyWrongAttempt,
} from "../studying-story-fixtures";

const meta = {
  title: "App/Studying/RouteView",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The studying route driven through its injected seams: a mocked lesson client and a fake recorder. " +
          "No network, microphone, or module-scope timers — the multiple-choice auto-advance runs immediately in these stories.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const noop = () => {};
const immediateAdvance = (run: () => void) => run();

export const LessonFlow: Story = {
  render: () => (
    <StudyingRouteView
      client={createStoryLessonClient()}
      onExit={noop}
      onStudyAgain={noop}
      postId={storyPostId}
      recorder={createStoryRecorder()}
      scheduleAdvance={immediateAdvance}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Happy path: record the say-it-back card (Stop submits a correct attempt), then answer the multiple-choice card to reach the streak-qualified completion.",
      },
    },
  },
};

export const MissedAttempts: Story = {
  render: () => (
    <StudyingRouteView
      client={createStoryLessonClient({ submitAttempt: async (input) => storyWrongAttempt(input) })}
      onExit={noop}
      postId={storyPostId}
      recorder={createStoryRecorder("Sail the way with me tonight")}
      scheduleAdvance={immediateAdvance}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Every attempt misses: the first miss is retryable in place, the second spends the appearance and requeues the card behind the remaining lesson.",
      },
    },
  },
};

export const LockedLesson: Story = {
  render: () => (
    <StudyingRouteView
      client={createStoryLessonClient({
        loadLesson: async () => ({
          post_id: storyPostId,
          title: "Paper Moon",
          locked: true,
          price_label: "$1.50",
          reward_label: "+25 $MOON",
          exercises: [],
        }),
      })}
      onExit={noop}
      postId={storyPostId}
    />
  ),
};

export const Loading: Story = {
  render: () => (
    <StudyingRouteView
      client={createStoryLessonClient({ loadLesson: () => new Promise(() => {}) })}
      postId={storyPostId}
    />
  ),
  parameters: {
    docs: { description: { story: "Payload never settles, holding the route loading state." } },
  },
};

export const LoadFailure: Story = {
  render: () => (
    <StudyingRouteView client={createFailingClient()} postId={storyPostId} />
  ),
};

export const AuthRequired: Story = {
  render: () => (
    <StudyingRouteView client={createAuthRequiredClient()} onConnect={noop} postId={storyPostId} />
  ),
};
