import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { StudyingRouteView } from "./studying-route-view";
import {
  createAuthRequiredClient,
  createFailingClient,
  createStoryLessonClient,
  createStoryRecorder,
  storyCorrectAttempt,
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

/** The disclosure acknowledgment persists per browser; consent stories reset it. */
const resetMicDisclosure = (canvasElement: HTMLElement): void => {
  canvasElement.ownerDocument.defaultView?.localStorage.removeItem("study:microphone-disclosure:v1");
};

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
    resetMicDisclosure(canvasElement);

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

/** The Spec 019 retention disclosure before the first capture. */
export const ConsentOpen: Story = {
  render: () => (
    <StudyingRouteView
      client={createStoryLessonClient()}
      onExit={noop}
      postId={storyPostId}
      recorder={createStoryRecorder()}
      scheduleAdvance={immediateAdvance}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Recording is gated by the personal microphone disclosure; nothing is captured before it is accepted.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    resetMicDisclosure(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Record" }));
    await expect(await canvas.findByRole("dialog", { name: "Recording disclosure" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Continue to record" })).toBeInTheDocument();
  },
};

/** Cancelling the disclosure leaves the lesson idle and captures nothing. */
export const ConsentCancelled: Story = {
  render: () => (
    <StudyingRouteView
      client={createStoryLessonClient()}
      onExit={noop}
      postId={storyPostId}
      recorder={createStoryRecorder()}
      scheduleAdvance={immediateAdvance}
    />
  ),
  parameters: {
    docs: {
      description: {
        story: "Cancel closes the disclosure without starting the recorder; Record stays available for a later attempt.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    resetMicDisclosure(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Record" }));
    await expect(await canvas.findByRole("dialog", { name: "Recording disclosure" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(canvas.queryByRole("dialog", { name: "Recording disclosure" })).toBeNull());
    await expect(canvas.getByRole("button", { name: "Record" })).toBeEnabled();
    await expect(canvas.queryByRole("button", { name: "Stop" })).toBeNull();
  },
};

/** Capture is running: Stop is the only action until the take ends. */
export const Recording: Story = {
  render: () => (
    <StudyingRouteView
      client={createStoryLessonClient()}
      onExit={noop}
      postId={storyPostId}
      recorder={createStoryRecorder()}
      scheduleAdvance={immediateAdvance}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    resetMicDisclosure(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Record" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Continue to record" }));
    await expect(await canvas.findByRole("button", { name: "Stop" })).toBeInTheDocument();
  },
};

/** The take is uploaded and graded; the footer is disabled while it is in flight. */
export const Grading: Story = {
  render: () => (
    <StudyingRouteView
      client={createStoryLessonClient({ submitAttempt: () => new Promise(() => {}) })}
      onExit={noop}
      postId={storyPostId}
      recorder={createStoryRecorder()}
      scheduleAdvance={immediateAdvance}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    resetMicDisclosure(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Record" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Continue to record" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Stop" }));
    await waitFor(() => expect(canvas.queryByRole("button", { name: "Stop" })).toBeNull());
    await expect(canvas.getByRole("button", { name: /Checking/ })).toBeDisabled();
  },
};

/** The server completed the lesson and the streak qualified. */
export const Completion: Story = {
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
        story: "Both cards resolve correctly and the completion view shows the qualified day streak.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    resetMicDisclosure(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Record" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Continue to record" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Stop" }));
    await userEvent.click(await canvas.findByRole("button", { name: "I don't know why you left so early" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await waitFor(() => expect(canvas.getByText("day streak")).toBeInTheDocument());
  },
};

/** The lesson completed but the daily qualification target was not met. */
export const QualificationNotAchieved: Story = {
  render: () => (
    <StudyingRouteView
      client={createStoryLessonClient({
        submitAttempt: async (input) => {
          const result = storyCorrectAttempt(input);
          if (input.type !== "translation_choice") return result;
          return {
            ...result,
            study_progress: {
              current_streak: 4,
              next_due_at: Math.floor(Date.now() / 1000) + 86_400,
              qualified_today: false,
              study_attempt_count: 2,
              study_correct_count: 1,
              study_target_count: 10,
            },
          };
        },
      })}
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
        story: "Completion without the daily qualification: the score is shown instead of a streak.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    resetMicDisclosure(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Record" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Continue to record" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Stop" }));
    await userEvent.click(await canvas.findByRole("button", { name: "I don't know why you left so early" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Continue" }));
    await waitFor(() => expect(canvas.getByText("Session complete")).toBeInTheDocument());
  },
};
