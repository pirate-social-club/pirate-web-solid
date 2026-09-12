import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { StudyingRouteView } from "./studying-route-view";
import {
  createAuthRequiredClient,
  createFailingClient,
  createStoryLessonClient,
  createStoryRecorder,
  storyPostId,
  storyWrongAttempt,
} from "./studying-story-fixtures";

const meta = {
  title: "Screens/Studying/Route",
  decorators: [(Story) => <main class="min-h-dvh bg-background text-foreground"><Story /></main>],
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
          "Happy path: record the say-it-back card (Stop submits a correct attempt, the server advances to its current card), then answer the multiple-choice card to reach the streak-qualified completion.",
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
      recorder={createStoryRecorder()}
      scheduleAdvance={immediateAdvance}
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Every attempt misses: each graded spoken presentation is spent server-side, so the miss reveals the transcript feedback and Continue moves to the server's next card; the missed line returns later in the lesson. The first capture is gated by the Spec 019 retention disclosure.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Spec 019 first-use disclosure gates the first capture; accept it.
    await userEvent.click(await canvas.findByRole("button", { name: "Record" }));
    await expect(await canvas.findByRole("dialog", { name: "Recording disclosure" })).toBeInTheDocument();
    await userEvent.click(await canvas.findByRole("button", { name: "Continue to record" }));

    // The miss is final for this appearance: feedback, then Continue.
    await userEvent.click(await canvas.findByRole("button", { name: "Stop" }));
    await expect(await canvas.findByText(/Incorrect/)).toBeInTheDocument();
    await expect(await canvas.findByText(/We heard:/)).toBeInTheDocument();
    await expect(await canvas.findByRole("button", { name: "Continue" })).toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await expect(await canvas.findByText("What does this line mean?")).toBeInTheDocument();
  },
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
