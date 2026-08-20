import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { PostComposerSubmission } from "./post-composer-submission";
import {
  reducePostComposerState,
  type PostComposerState,
} from "./post-composer-state";

const meta = {
  title: "Compositions/Posts/PostComposerSubmission",
  component: PostComposerSubmission,
  args: { state: { status: "editing" as const } },
  parameters: { layout: "centered", a11y: { test: "error" } },
} satisfies Meta<typeof PostComposerSubmission>;

export default meta;
type Story = StoryObj<typeof meta>;

function frame(state: PostComposerState, onRetry?: () => void) {
  return (
    <main class="w-full max-w-xl p-6">
      <h1 class="mb-4 text-lg font-semibold">Create a post</h1>
      <PostComposerSubmission onRetry={onRetry} state={state} />
    </main>
  );
}

export const Submitting: Story = {
  render: () => frame({ status: "submitting" }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Submitting your post…")).toBeInTheDocument();
    await expect(canvas.getByRole("status")).toHaveAttribute("aria-busy", "true");
  },
};

export const Published: Story = {
  render: () => frame({ status: "published" }),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Post published.")).toBeInTheDocument();
  },
};

export const ManualReview: Story = {
  render: () => frame({ status: "manual_review" }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("This post is awaiting review.")).toBeInTheDocument();
    await expect(canvas.queryByText("Post published.")).toBeNull();
  },
};

export const Blocked: Story = {
  render: () => frame({ status: "blocked" }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("blocked by community policy");
    await expect(canvas.queryByText("Post published.")).toBeNull();
  },
};

export const FailureRetry: Story = {
  render: () => {
    const [state, setState] = createSignal<PostComposerState>({ status: "failure", message: "The request failed. Try again." });
    const retry = () => setState(reducePostComposerState(state(), { type: "retry" }));
    return (
      <main class="w-full max-w-xl p-6">
        <h1 class="mb-4 text-lg font-semibold">Create a post</h1>
        <PostComposerSubmission onRetry={retry} state={state()} />
      </main>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(canvas.getByText("Submitting your post…")).toBeInTheDocument();
  },
};
