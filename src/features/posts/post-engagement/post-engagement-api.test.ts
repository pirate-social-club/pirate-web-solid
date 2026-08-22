import { describe, expect, test, vi } from "vitest";

import { createPostEngagementTransport } from "./post-engagement-api.ts";

const commentResponse = {
  submission_id: "submission-1",
  href: "/comments/comment-1",
  surface: "comment",
  status: "published",
  result: { decision: "allow", reason_code: null },
  published_resource: { kind: "comment", comment_id: "comment-1", href: "/comments/comment-1" },
  review_ref: null,
  created_at: "2026-08-22T00:00:00.000Z",
  updated_at: "2026-08-22T00:00:00.000Z",
} as const;

function clientFixture(onCommentOptions?: (value: unknown) => void) {
  return {
    post_postsPostIdComments: vi.fn(async (...args: readonly unknown[]) => {
      onCommentOptions?.(args[1]);
      return commentResponse;
    }),
    post_commentsCommentIdReplies: vi.fn(async () => ({ ...commentResponse, surface: "reply" as const })),
    post_commentsCommentIdReports: vi.fn(async () => ({ report_id: "report-1", case_ref: "case-1", status: "open" as const })),
    post_moderationCasesCaseRefActions: vi.fn(async () => ({
      action_id: "action-1",
      case_ref: "case-1",
      action: "hide" as const,
      target_status: "hidden" as const,
    })),
    post_postsPostIdVote: vi.fn(async () => ({ post_id: "post-1", value: -1 as const, upvote_count: 2, downvote_count: 3 })),
    post_postsPostIdClearVote: vi.fn(async () => ({ post_id: "post-1", value: 0 as const, upvote_count: 2, downvote_count: 2 })),
  };
}

describe("createPostEngagementTransport", () => {
  test("uses generated operations with exact bodies and session CSRF options", async () => {
    let commentOptions: unknown;
    const client = clientFixture(value => { commentOptions = value; });
    const transport = createPostEngagementTransport({ client, csrfToken: () => "csrf-token" });

    await transport.createComment("post-1", "First", "key-comment");
    await transport.createReply("comment-1", "Reply", "key-reply");
    await transport.reportComment("comment-1", "spam", "key-report");
    await transport.moderateCase("case-1", "hide", "key-action");
    await transport.castVote("post-1", -1, "key-vote");
    await transport.clearVote("post-1", "key-clear");

    expect(client.post_postsPostIdComments).toHaveBeenCalledWith(
      { path: { postId: "post-1" }, body: { idempotency_key: "key-comment", body: "First" } },
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(commentOptions).toMatchObject({ credentials: "same-origin", headers: expect.any(Headers) });
    if (typeof commentOptions !== "object" || commentOptions === null || !("headers" in commentOptions)) {
      throw new Error("request options did not include headers");
    }
    expect(commentOptions.headers).toBeInstanceOf(Headers);
    if (!(commentOptions.headers instanceof Headers)) throw new Error("request headers were not Headers");
    expect(commentOptions.headers.get("x-csrf-token")).toBe("csrf-token");
    expect(client.post_commentsCommentIdReplies).toHaveBeenCalledWith(
      { path: { commentId: "comment-1" }, body: { idempotency_key: "key-reply", body: "Reply" } },
      expect.any(Object),
    );
    expect(client.post_commentsCommentIdReports).toHaveBeenCalledWith(
      { path: { commentId: "comment-1" }, body: { idempotency_key: "key-report", reason_code: "spam" } },
      expect.any(Object),
    );
    expect(client.post_moderationCasesCaseRefActions).toHaveBeenCalledWith(
      { path: { caseRef: "case-1" }, body: { idempotency_key: "key-action", action: "hide" } },
      expect.any(Object),
    );
    expect(client.post_postsPostIdVote).toHaveBeenCalledWith(
      { path: { postId: "post-1" }, body: { idempotency_key: "key-vote", value: -1 } },
      expect.any(Object),
    );
    expect(client.post_postsPostIdClearVote).toHaveBeenCalledWith(
      { path: { postId: "post-1" }, body: { idempotency_key: "key-clear" } },
      expect.any(Object),
    );
  });

  test("fails locally before calling the API when CSRF state is absent", async () => {
    const client = clientFixture();
    const transport = createPostEngagementTransport({ client, csrfToken: () => undefined });

    await expect(transport.createComment("post-1", "First", "key-comment")).rejects.toMatchObject({
      code: "csrf_missing",
    });
    expect(client.post_postsPostIdComments).not.toHaveBeenCalled();
  });
});
