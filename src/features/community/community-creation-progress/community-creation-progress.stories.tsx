import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Type } from "@pirate/web-solid-ui";
import { CommunityCreationProgressView } from "./community-creation-progress";
import {
  createIntent,
  type CommunityCreationIntentView,
} from "./community-creation-progress-model";

function ProgressStory(props: { committing?: boolean; intent: CommunityCreationIntentView; stale?: boolean }) {
  const [intent, setIntent] = createSignal<CommunityCreationIntentView>(props.intent);
  const [stale, setStale] = createSignal(Boolean(props.stale));
  const [attempts, setAttempts] = createSignal(0);
  const [viewed, setViewed] = createSignal(0);
  const [lastCommitRevision, setLastCommitRevision] = createSignal(0);
  const commit = (input: { intentId: string; expectedRevision: number }) => {
    setLastCommitRevision(input.expectedRevision);
    setIntent((current) => ({
      ...current,
      status: "committed",
      nextAction: { kind: "none", reason: "committed" },
      committedHref: "/c/community_1",
      revision: current.revision + 1,
    }));
  };
  const view = () => setViewed((count) => count + 1);
  const retry = () => {
    setStale(false);
    setAttempts((count) => count + 1);
  };

  return (
    <div class="min-h-[640px] bg-background p-6 text-foreground">
      <CommunityCreationProgressView
        committing={props.committing}
        intent={intent()}
        onCommit={commit}
        onRetry={retry}
        onView={view}
        staleRevision={stale() ? { expectedRevision: props.intent.revision - 1 } : null}
      />
      <Type aria-live="polite" class="sr-only" variant="caption">
        {`Attempts ${attempts()}; viewed ${viewed()}; last commit revision ${lastCommitRevision()}; revision ${intent().revision}`}
      </Type>
    </div>
  );
}

const meta = {
  title: "Flows/Community/CreationProgress",
  component: CommunityCreationProgressView,
  args: { intent: createIntent(), onCommit: () => undefined, onRetry: () => undefined, onView: () => undefined },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof CommunityCreationProgressView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PreBoundaryVerification: Story = {
  render: () => (
    <ProgressStory
      intent={createIntent({
        status: "verification_required",
        nextAction: { kind: "blocked", reason: "pre_boundary_verification" },
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Older creation draft")).toBeInTheDocument();
    await expect(canvas.getByText(/This older draft cannot be completed here/)).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Start verification" })).toBeNull();
  },
};

export const Waiting: Story = {
  render: () => (
    <ProgressStory
      intent={createIntent({
        status: "verification_required",
        nextAction: { kind: "wait", requirement: "human_identity", reasonCode: "verification_pending", retryAfterSeconds: 30 },
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Identity verification is still in progress.")).toBeInTheDocument();
    await expect(canvas.getByText("Retry in 30s")).toBeInTheDocument();
  },
};

export const CommitReady: Story = {
  render: () => (
    <ProgressStory
      intent={createIntent({
        status: "commit_ready",
        nextAction: { kind: "commit" },
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Create community" }));
    await expect(canvas.getByText("Your community is live.")).toBeInTheDocument();
    await expect(canvas.getByText(/last commit revision 1/)).toBeInTheDocument();
  },
};

export const Committing: Story = {
  render: () => (
    <ProgressStory
      committing
      intent={createIntent({
        status: "commit_ready",
        nextAction: { kind: "commit" },
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "Create community" });
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute("aria-busy", "true");
  },
};

export const Committed: Story = {
  render: () => (
    <ProgressStory
      intent={createIntent({
        status: "committed",
        nextAction: { kind: "none", reason: "committed" },
        committedHref: "/c/community_1",
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Your community is live.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "View community" }));
    await expect(canvas.getByText(/viewed 1/)).toBeInTheDocument();
  },
};

export const BlockedQuota: Story = {
  render: () => (
    <ProgressStory
      intent={createIntent({
        status: "quota_exceeded",
        nextAction: { kind: "blocked", reason: "quota_exceeded" },
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("You've reached the limit of communities you can create.")).toBeInTheDocument();
  },
};

export const BlockedGateUnsupported: Story = {
  render: () => (
    <ProgressStory
      intent={createIntent({
        status: "gate_unsupported",
        nextAction: { kind: "blocked", reason: "gate_unsupported" },
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("One of the requirements you chose isn't available right now.")).toBeInTheDocument();
  },
};

export const Expired: Story = {
  render: () => (
    <ProgressStory
      intent={createIntent({
        status: "expired",
        nextAction: { kind: "none", reason: "expired" },
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("This creation draft expired. Start a new community to continue.")).toBeInTheDocument();
  },
};

export const Cancelled: Story = {
  render: () => (
    <ProgressStory
      intent={createIntent({
        status: "cancelled",
        nextAction: { kind: "none", reason: "cancelled" },
      })}
    />
  ),
};

export const StaleRevision: Story = {
  render: () => (
    <ProgressStory
      stale
      intent={createIntent({
        status: "verification_required",
        nextAction: { kind: "blocked", reason: "pre_boundary_verification" },
        revision: 3,
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent("This creation changed");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(canvas.queryByRole("alert")).toBeNull();
    await expect(canvas.getByText(/Attempts 1/)).toBeInTheDocument();
  },
};
