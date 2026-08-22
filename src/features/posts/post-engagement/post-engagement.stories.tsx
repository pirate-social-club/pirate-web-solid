/** @jsxImportSource @solidjs/web */
import { ApiClientError } from "@pirate/api-client";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";

import { Card, CardContent, Type } from "../../../design-system.ts";
import type { PostEngagementTransport } from "./post-engagement-api.ts";
import type { CommentDisplayState, CommentThreadItem } from "./post-engagement-model.ts";
import { createMemoryPendingEngagementStorage, decodePendingEngagementAction } from "./post-engagement-pending.ts";
import { PostEngagement } from "./post-engagement.tsx";

const noopTransport: PostEngagementTransport = {
  createComment: async () => { throw new Error("Story does not submit comments"); },
  createReply: async () => { throw new Error("Story does not submit replies"); },
  reportComment: async envelope => {
    const action = await decodePendingEngagementAction(envelope);
    if (action.kind !== "report") throw new Error("expected report action");
    return { report_id: action.idempotencyKey, case_ref: "case-story", status: "open" };
  },
  moderateCase: async envelope => {
    const action = await decodePendingEngagementAction(envelope);
    if (action.kind !== "moderate") throw new Error("expected moderation action");
    return {
      action_id: action.idempotencyKey,
      case_ref: action.caseRef,
      action: action.action,
      target_status: action.action === "approve" || action.action === "restore" || action.action === "dismiss" ? "published" : action.action === "hide" ? "hidden" : "removed",
    };
  },
  castVote: async envelope => {
    const action = await decodePendingEngagementAction(envelope);
    if (action.kind !== "vote") throw new Error("expected vote action");
    return { post_id: action.postId, value: action.value };
  },
  clearVote: async envelope => {
    const action = await decodePendingEngagementAction(envelope);
    if (action.kind !== "clear_vote") throw new Error("expected clear vote action");
    return { post_id: action.postId, value: 0 };
  },
  readSubmission: async () => { throw new Error("Story does not read submissions"); },
};

const states: readonly CommentDisplayState[] = [
  "submitting",
  "manual_review",
  "blocked",
  "published",
  "hidden",
  "removed",
  "restored",
];

const comments: readonly CommentThreadItem[] = states.map((state, index) => ({
  id: `comment-${state}`,
  submissionId: state === "submitting" ? null : `submission-${state}`,
  parentId: null,
  body: `${state.replace("_", " ")} comment fixture`,
  depth: index === 6 ? 8 : index % 3,
  replyCount: index,
  state,
  caseRef: state === "manual_review" || state === "published" || state === "hidden" || state === "removed" || state === "restored"
    ? `case-${state}`
    : null,
  href: state === "published" || state === "restored" ? `/comments/comment-${state}` : null,
}));

function frame(viewerVote: -1 | 1 | null, transport: PostEngagementTransport = noopTransport, initialComments = comments) {
  return (
    <div class="mx-auto max-w-3xl p-6">
      <PostEngagement
        canModerate
        principalId="storybook-viewer"
        generateIdempotencyKey={() => crypto.randomUUID()}
        initialComments={initialComments}
        pendingStorage={createMemoryPendingEngagementStorage()}
        post={{ id: "story-post", upvoteCount: 18, downvoteCount: 1, commentCount: 7, viewerVote }}
        transport={transport}
      >
        {(controls) => <Card><CardContent class="flex flex-col gap-4 p-6"><Type variant="h2">Harbor discussion</Type>{controls}</CardContent></Card>}
      </PostEngagement>
    </div>
  );
}

const meta = {
  title: "Compositions/Posts/PostEngagement",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const CommentStateMatrix: Story = {
  render: () => frame(null),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("button", { name: "Comments (7)" }));
    for (const state of states) {
      await expect(canvasElement.ownerDocument.querySelector(`[data-comment-state='${state}']`)).toBeInTheDocument();
    }
    await expect(body.getByText("Depth 8 · 6 replies")).toBeInTheDocument();
  },
};

export const Upvoted: Story = { render: () => frame(1, noopTransport, []) };
export const Downvoted: Story = { render: () => frame(-1, noopTransport, []) };
export const ClearedVote: Story = { render: () => frame(null, noopTransport, []) };

const conflictTransport: PostEngagementTransport = {
  ...noopTransport,
  castVote: async () => {
    throw new ApiClientError(
      { status: 409, code: "conflict", name: "PostVoteIdempotencyConflict", retryable: false },
      {
        error: {
          code: "conflict",
          message: "action key reused",
          retryable: false,
          details: { reason_code: "idempotency_conflict", action_id: "vote-action-1" },
        },
      },
    );
  },
};

export const VoteConflict: Story = {
  render: () => frame(null, conflictTransport, []),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Upvote" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent("action key was already used");
  },
};
