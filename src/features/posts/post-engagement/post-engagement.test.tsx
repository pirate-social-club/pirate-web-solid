import type { JSX } from "@solidjs/web";
import { render as solidRender } from "@solidjs/web";
import { ApiClientError } from "@pirate/api-client";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PostEngagementTransport } from "./post-engagement-api.ts";
import { createMemoryPendingEngagementStorage, decodePendingEngagementAction } from "./post-engagement-pending.ts";
import { PostEngagement } from "./post-engagement.tsx";

const disposers: Array<() => void> = [];

function render(ui: () => JSX.Element): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let dispose: () => void = () => {};
  createRoot(rootDispose => {
    dispose = rootDispose;
    solidRender(ui, container);
  });
  disposers.push(() => {
    dispose();
    container.remove();
  });
  return container;
}

function button(label: string): HTMLButtonElement {
  const match = [...document.querySelectorAll("button")].find(candidate =>
    candidate.getAttribute("aria-label") === label || candidate.textContent?.trim() === label,
  );
  if (!(match instanceof HTMLButtonElement)) throw new Error(`button not found: ${label}`);
  return match;
}

function transportFixture(createComment: PostEngagementTransport["createComment"]): PostEngagementTransport {
  return {
    createComment,
    createReply: vi.fn(),
    reportComment: vi.fn(),
    moderateCase: vi.fn(),
    castVote: vi.fn(async envelope => {
      const action = await decodePendingEngagementAction(envelope);
      if (action.kind !== "vote") throw new Error("expected vote action");
      return { post_id: action.postId, value: action.value };
    }),
    clearVote: vi.fn(async envelope => {
      const action = await decodePendingEngagementAction(envelope);
      if (action.kind !== "clear_vote") throw new Error("expected clear vote action");
      return { post_id: action.postId, value: 0 as const };
    }),
    readSubmission: vi.fn(async () => { throw new Error("submission read not configured"); }),
  };
}

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  document.body.replaceChildren();
});

describe("PostEngagement", () => {
  test("restores exact comment bytes and the same key after a component reload", async () => {
    const createComment = vi.fn()
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce({
        submission_id: "submission-1",
        href: "/comments/comment-1",
        surface: "comment",
        status: "published",
        result: { decision: "allow", reason_code: null },
        published_resource: { kind: "comment", comment_id: "comment-1", href: "/comments/comment-1" },
        review_ref: null,
        created_at: "2026-08-22T00:00:00.000Z",
        updated_at: "2026-08-22T00:00:00.000Z",
      });
    window.scrollTo = vi.fn();
    const pendingStorage = createMemoryPendingEngagementStorage();
    const generateKey = vi.fn(() => "stable-comment-key");
    render(() => <PostEngagement
      generateIdempotencyKey={generateKey}
      pendingStorage={pendingStorage}
      post={{ id: "post-1", upvoteCount: 3, downvoteCount: 1, commentCount: 0, viewerVote: null }}
      transport={transportFixture(createComment)}
    />);

    button("Comments (0)").click();
    await vi.waitFor(() => expect(document.querySelector("textarea[aria-label='Write a comment']")).not.toBeNull());
    const textarea = document.querySelector("textarea[aria-label='Write a comment']");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("comment textarea not found");
    textarea.value = "A durable comment";
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, data: "A durable comment", inputType: "insertText" }));
    await vi.waitFor(() => expect(button("Post comment").disabled).toBe(false));
    button("Post comment").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Retrying will reuse the same action key"));

    const disposeFirstSession = disposers.pop();
    disposeFirstSession?.();
    render(() => <PostEngagement
      generateIdempotencyKey={generateKey}
      pendingStorage={pendingStorage}
      post={{ id: "post-1", upvoteCount: 3, downvoteCount: 1, commentCount: 0, viewerVote: null }}
      transport={transportFixture(createComment)}
    />);
    button("Comments (0)").click();
    await vi.waitFor(() => {
      const restored = document.querySelector("textarea[aria-label='Write a comment']");
      if (!(restored instanceof HTMLTextAreaElement)) throw new Error("restored comment textarea missing");
      expect(restored.value).toBe("A durable comment");
    });
    button("Post comment").click();
    await vi.waitFor(() => expect(document.querySelector("[data-comment-state='published']")?.textContent).toContain("A durable comment"));
    const firstAction = await decodePendingEngagementAction(createComment.mock.calls[0]?.[0]);
    const secondAction = await decodePendingEngagementAction(createComment.mock.calls[1]?.[0]);
    expect(firstAction).toEqual({ kind: "comment", postId: "post-1", body: "A durable comment", idempotencyKey: "stable-comment-key" });
    expect(secondAction).toEqual(firstAction);
    expect(createComment.mock.calls[1]?.[0]).toEqual(createComment.mock.calls[0]?.[0]);
    expect(generateKey).toHaveBeenCalledTimes(1);
    expect(button("Comments (1)")).toBeTruthy();
  });

  test("mints a new comment key only after explicit rejected-action discard", async () => {
    window.scrollTo = vi.fn();
    const createComment = vi.fn()
      .mockRejectedValueOnce(new ApiClientError(
        { status: 409, code: "conflict", name: "Conflict", retryable: false },
        { error: {
          code: "conflict",
          message: "key reused",
          retryable: false,
          details: { reason_code: "idempotency_conflict", submission_id: "submission-existing" },
        } },
      ))
      .mockResolvedValueOnce({
        submission_id: "submission-new",
        href: "/comments/comment-new",
        surface: "comment",
        status: "published",
        result: { decision: "allow", reason_code: null },
        published_resource: { kind: "comment", comment_id: "comment-new", href: "/comments/comment-new" },
        review_ref: null,
        created_at: "2026-08-22T00:00:00.000Z",
        updated_at: "2026-08-22T00:00:00.000Z",
      });
    const keys = ["rejected-key", "new-key"];
    const pendingStorage = createMemoryPendingEngagementStorage();
    render(() => <PostEngagement
      generateIdempotencyKey={() => keys.shift() ?? "unexpected"}
      pendingStorage={pendingStorage}
      post={{ id: "post-1", upvoteCount: 0, downvoteCount: 0, commentCount: 0, viewerVote: null }}
      transport={transportFixture(createComment)}
    />);

    button("Comments (0)").click();
    await vi.waitFor(() => expect(document.querySelector("textarea[aria-label='Write a comment']")).not.toBeNull());
    const textarea = document.querySelector("textarea[aria-label='Write a comment']");
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error("comment textarea not found");
    textarea.value = "A corrected comment";
    textarea.dispatchEvent(new InputEvent("input", { bubbles: true, data: "A corrected comment", inputType: "insertText" }));
    await vi.waitFor(() => expect(button("Post comment").disabled).toBe(false));
    button("Post comment").click();
    await vi.waitFor(() => expect(button("Discard rejected action")).toBeTruthy());
    button("Post comment").click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(createComment).toHaveBeenCalledTimes(1);

    button("Discard rejected action").click();
    await vi.waitFor(async () => expect(await pendingStorage.load("post:post-1:comment-submission")).toBeNull());
    if (![...document.querySelectorAll("button")].some(candidate => candidate.textContent?.trim() === "Post comment")) {
      button("Comments (0)").click();
      await vi.waitFor(() => expect(button("Post comment")).toBeTruthy());
    }
    button("Post comment").click();
    await vi.waitFor(() => expect(document.querySelector("[data-comment-id='comment-new']")).not.toBeNull());
    expect((await decodePendingEngagementAction(createComment.mock.calls[0]?.[0])).idempotencyKey).toBe("rejected-key");
    expect((await decodePendingEngagementAction(createComment.mock.calls[1]?.[0])).idempotencyKey).toBe("new-key");
  });

  test("casts, changes, and clears a post vote without moderation", async () => {
    const transport = transportFixture(vi.fn());
    const keys = ["vote-up", "vote-down", "vote-clear"];
    render(() => <PostEngagement
      generateIdempotencyKey={() => keys.shift() ?? "unexpected"}
      pendingStorage={createMemoryPendingEngagementStorage()}
      post={{ id: "post-1", upvoteCount: 3, downvoteCount: 1, commentCount: 0, viewerVote: null }}
      transport={transport}
    />);

    button("Upvote").click();
    await vi.waitFor(() => expect(button("Upvote").getAttribute("aria-pressed")).toBe("true"));
    button("Downvote").click();
    await vi.waitFor(() => expect(button("Downvote").getAttribute("aria-pressed")).toBe("true"));
    button("Downvote").click();
    await vi.waitFor(() => expect(button("Downvote").getAttribute("aria-pressed")).toBe("false"));

    const firstVote = await decodePendingEngagementAction(vi.mocked(transport.castVote).mock.calls[0]?.[0]);
    const secondVote = await decodePendingEngagementAction(vi.mocked(transport.castVote).mock.calls[1]?.[0]);
    const clearVote = await decodePendingEngagementAction(vi.mocked(transport.clearVote).mock.calls[0]?.[0]);
    expect(firstVote).toMatchObject({ kind: "vote", postId: "post-1", value: 1, idempotencyKey: "vote-up" });
    expect(secondVote).toMatchObject({ kind: "vote", postId: "post-1", value: -1, idempotencyKey: "vote-down" });
    expect(clearVote).toMatchObject({ kind: "clear_vote", postId: "post-1", idempotencyKey: "vote-clear" });
    expect(transport.moderateCase).not.toHaveBeenCalled();
  });

  test("refuses a new vote direction while retrying the retained vote key", async () => {
    const transport = transportFixture(vi.fn());
    vi.mocked(transport.castVote)
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockImplementationOnce(async envelope => {
        const action = await decodePendingEngagementAction(envelope);
        if (action.kind !== "vote") throw new Error("expected vote action");
        return { post_id: action.postId, value: action.value };
      });
    const generateKey = vi.fn(() => "stable-vote-key");
    render(() => <PostEngagement
      generateIdempotencyKey={generateKey}
      pendingStorage={createMemoryPendingEngagementStorage()}
      post={{ id: "post-1", upvoteCount: 3, downvoteCount: 1, commentCount: 0, viewerVote: null }}
      transport={transport}
    />);

    button("Upvote").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Retrying will reuse the same action key"));
    button("Downvote").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("saved action"));
    expect(transport.castVote).toHaveBeenCalledTimes(1);
    button("Upvote").click();
    await vi.waitFor(() => expect(button("Upvote").getAttribute("aria-pressed")).toBe("true"));
    expect(transport.castVote).toHaveBeenCalledTimes(2);
    const first = vi.mocked(transport.castVote).mock.calls[0]?.[0];
    const second = vi.mocked(transport.castVote).mock.calls[1]?.[0];
    expect(second).toEqual(first);
    expect(generateKey).toHaveBeenCalledTimes(1);
  });

  test("reads back an approved held comment before exposing addressable actions", async () => {
    window.scrollTo = vi.fn();
    const transport = {
      ...transportFixture(vi.fn()),
      moderateCase: vi.fn(async (_envelope: Parameters<PostEngagementTransport["moderateCase"]>[0]) => ({
        action_id: "approve-action",
        case_ref: "case-held",
        action: "approve" as const,
        target_status: "published" as const,
      })),
      readSubmission: vi.fn()
        .mockRejectedValueOnce(new Error("readback unavailable"))
        .mockResolvedValueOnce({
          submission_id: "submission-held",
          href: "/comments/comment-approved",
          surface: "comment" as const,
          status: "published" as const,
          result: { decision: "allow" as const, reason_code: null },
          published_resource: { kind: "comment" as const, comment_id: "comment-approved", href: "/comments/comment-approved" },
          review_ref: null,
          created_at: "2026-08-22T00:00:00.000Z",
          updated_at: "2026-08-22T00:00:01.000Z",
        }),
    };
    render(() => <PostEngagement
      canModerate
      generateIdempotencyKey={() => "approve-key"}
      initialComments={[{
        id: "submission:submission-held",
        submissionId: "submission-held",
        parentId: null,
        body: "Held comment",
        depth: 0,
        replyCount: 0,
        state: "manual_review",
        caseRef: "case-held",
        href: "/text-content-submissions/submission-held",
      }]}
      pendingStorage={createMemoryPendingEngagementStorage()}
      post={{ id: "post-1", upvoteCount: 3, downvoteCount: 1, commentCount: 0, viewerVote: null }}
      transport={transport}
    />);

    button("Comments (0)").click();
    await vi.waitFor(() => expect(button("Approve")).toBeTruthy());
    expect([...document.querySelectorAll("button")].some(candidate => candidate.textContent?.trim() === "Dismiss")).toBe(false);
    button("Approve").click();
    await vi.waitFor(() => expect(button("Refresh comment")).toBeTruthy());
    expect(document.querySelector("[data-comment-id='submission:submission-held']")?.getAttribute("data-comment-state")).toBe("published");
    button("Refresh comment").click();
    await vi.waitFor(() => expect(document.querySelector("[data-comment-id='comment-approved']")).not.toBeNull());
    expect(button("Report")).toBeTruthy();
    expect(button("Reply")).toBeTruthy();
    expect(transport.readSubmission).toHaveBeenCalledTimes(2);
    expect(transport.readSubmission).toHaveBeenCalledWith("submission-held");
  });

  test("retains a reported case reference and updates visible counts after moderation", async () => {
    window.scrollTo = vi.fn();
    const transport = {
      ...transportFixture(vi.fn()),
      reportComment: vi.fn(async (_envelope: Parameters<PostEngagementTransport["reportComment"]>[0]) => ({ report_id: "report-1", case_ref: "case-1", status: "open" as const })),
      moderateCase: vi.fn(async (_envelope: Parameters<PostEngagementTransport["moderateCase"]>[0]) => ({
        action_id: "action-1",
        case_ref: "case-1",
        action: "hide" as const,
        target_status: "hidden" as const,
      })),
    };
    const keys = ["report-key", "moderation-key"];
    render(() => <PostEngagement
      canModerate
      generateIdempotencyKey={() => keys.shift() ?? "unexpected"}
      pendingStorage={createMemoryPendingEngagementStorage()}
      initialComments={[{
        id: "comment-1",
        submissionId: "submission-1",
        parentId: null,
        body: "Visible comment",
        depth: 0,
        replyCount: 0,
        state: "published",
        caseRef: null,
        href: "/comments/comment-1",
      }]}
      post={{ id: "post-1", upvoteCount: 3, downvoteCount: 1, commentCount: 1, viewerVote: null }}
      transport={transport}
    />);

    button("Comments (1)").click();
    await vi.waitFor(() => expect(document.querySelector("[data-comment-id='comment-1']")).not.toBeNull());
    expect([...document.querySelectorAll("button")].some(candidate => candidate.textContent?.trim() === "Hide")).toBe(false);
    button("Report").click();
    await vi.waitFor(() => expect(button("Hide")).toBeTruthy());
    const reportEnvelope = vi.mocked(transport.reportComment).mock.calls[0]?.[0];
    if (reportEnvelope === undefined) throw new Error("report envelope missing");
    expect(await decodePendingEngagementAction(reportEnvelope)).toMatchObject({
      kind: "report", commentId: "comment-1", reasonCode: "spam", idempotencyKey: "report-key",
    });

    button("Hide").click();
    await vi.waitFor(() => expect(document.querySelector("[data-comment-state='hidden']")).not.toBeNull());
    expect(button("Restore")).toBeTruthy();
    expect(button("Comments (0)")).toBeTruthy();
    const moderationEnvelope = vi.mocked(transport.moderateCase).mock.calls[0]?.[0];
    if (moderationEnvelope === undefined) throw new Error("moderation envelope missing");
    expect(await decodePendingEngagementAction(moderationEnvelope)).toMatchObject({
      kind: "moderate", caseRef: "case-1", action: "hide", idempotencyKey: "moderation-key",
    });
  });

  test("restores and replays a pending report with the same reason, bytes, and key", async () => {
    window.scrollTo = vi.fn();
    const reportComment = vi.fn()
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce({ report_id: "report-1", case_ref: "case-1", status: "open" as const });
    const transport = { ...transportFixture(vi.fn()), reportComment };
    const pendingStorage = createMemoryPendingEngagementStorage();
    const generateKey = vi.fn(() => "stable-report-key");
    const props = {
      generateIdempotencyKey: generateKey,
      pendingStorage,
      initialComments: [{
        id: "comment-1",
        submissionId: "submission-1",
        parentId: null,
        body: "Visible comment",
        depth: 0,
        replyCount: 0,
        state: "published" as const,
        caseRef: null,
        href: "/comments/comment-1",
      }],
      post: { id: "post-1", upvoteCount: 0, downvoteCount: 0, commentCount: 1, viewerVote: null },
      transport,
    };
    render(() => <PostEngagement {...props} />);
    button("Comments (1)").click();
    await vi.waitFor(() => expect(button("Report")).toBeTruthy());
    const reason = document.querySelector("select[aria-label='Report reason']");
    if (!(reason instanceof HTMLSelectElement)) throw new Error("report reason missing");
    reason.value = "harassment";
    reason.dispatchEvent(new Event("change", { bubbles: true }));
    button("Report").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Retrying will reuse the same action key"));

    disposers.pop()?.();
    render(() => <PostEngagement {...props} />);
    button("Comments (1)").click();
    await vi.waitFor(() => {
      const restoredReason = document.querySelector("select[aria-label='Report reason']");
      if (!(restoredReason instanceof HTMLSelectElement)) throw new Error("restored report reason missing");
      expect(restoredReason.value).toBe("harassment");
    });
    button("Report").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Report open"));
    expect(reportComment).toHaveBeenCalledTimes(2);
    expect(reportComment.mock.calls[1]?.[0]).toEqual(reportComment.mock.calls[0]?.[0]);
    expect(generateKey).toHaveBeenCalledTimes(1);
  });
});
