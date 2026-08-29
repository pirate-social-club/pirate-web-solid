import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { PostComposerSubmission } from "./post-composer-submission";
import {
  reducePostComposerState,
  type PostComposerState,
} from "./post-composer-state";

const meta = {
  title: "Flows/Posts/Submission",
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
  render: () => frame({ status: "submitting", pending_request_id: "pending-request-1" }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Submitting your post…")).toBeInTheDocument();
    await expect(canvas.getByRole("status")).toHaveAttribute("aria-busy", "true");
  },
};

export const Reconciling: Story = {
  render: () => frame({ status: "reconciling", pending_request_id: "pending-request-1" }, () => {}),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Checking whether your post was accepted…")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Check again" })).toBeInTheDocument();
  },
};

export const Published: Story = {
  render: () => frame({ status: "published", submission_id: "sub-1", post_href: "/posts/post-1" }),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("Post published.")).toBeInTheDocument();
  },
};

export const ManualReview: Story = {
  render: () => frame({ status: "manual_review", submission_id: "sub-1", reason_code: "review_required", review_ref: "review-1" }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("This post is awaiting review.")).toBeInTheDocument();
    await expect(canvas.queryByText("Post published.")).toBeNull();
  },
};

export const ManualReviewModerationUnavailable: Story = {
  render: () => frame({ status: "manual_review", submission_id: "sub-1", reason_code: "moderation_unavailable", review_ref: "review-1" }),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/moderation is temporarily unavailable/)).toBeInTheDocument();
  },
};

export const Blocked: Story = {
  render: () => frame({ status: "blocked", submission_id: "sub-1" }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("blocked by community policy");
    await expect(canvas.queryByText("Post published.")).toBeNull();
  },
};

export const FailureRetry: Story = {
  render: () => {
    const [state, setState] = createSignal<PostComposerState>({ status: "transport_failure", reason: "serialization_failed" });
    const retry = () => setState(reducePostComposerState(state(), { type: "retry_requested", pending_request_id: "pending-request-2" }));
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

export const Abandoned: Story = {
  render: () => frame({ status: "abandoned", submission_id: "sub-1" }),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/cancelled before publication/)).toBeInTheDocument();
  },
};

export const LocalValidationFailure: Story = {
  render: () => frame({ status: "transport_failure", reason: "local_validation_failed" }),
};

export const SerializationFailure: Story = {
  render: () => frame({ status: "transport_failure", reason: "serialization_failed" }),
};

export const DurableStorageFailure: Story = {
  render: () => frame({ status: "transport_failure", reason: "durable_storage_failed" }),
};
