import { describe, expect, test, vi } from "vitest";

import { createPostEngagementTransport } from "./post-engagement-api.ts";
import { createPendingEngagementRecord } from "./post-engagement-pending.ts";

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
    post_postsPostIdVote: vi.fn(async () => ({ post_id: "post-1", value: -1 as const })),
    post_postsPostIdClearVote: vi.fn(async () => ({ post_id: "post-1", value: 0 as const })),
    get_textContentSubmissionsSubmissionId: vi.fn(async () => commentResponse),
  };
}

describe("createPostEngagementTransport", () => {
  test("uses generated operations with exact bodies and session CSRF options", async () => {
    let commentOptions: unknown;
    const client = clientFixture(value => { commentOptions = value; });
    const transport = createPostEngagementTransport({ client, csrfToken: () => "csrf-token" });

    await transport.createComment((await createPendingEngagementRecord({ kind: "comment", postId: "post-1", body: "First", idempotencyKey: "key-comment" })).envelope);
    await transport.createReply((await createPendingEngagementRecord({ kind: "reply", commentId: "comment-1", body: "Reply", idempotencyKey: "key-reply" })).envelope);
    await transport.reportComment((await createPendingEngagementRecord({ kind: "report", commentId: "comment-1", reasonCode: "spam", idempotencyKey: "key-report" })).envelope);
    await transport.moderateCase((await createPendingEngagementRecord({ kind: "moderate", caseRef: "case-1", action: "hide", idempotencyKey: "key-action" })).envelope);
    await transport.castVote((await createPendingEngagementRecord({ kind: "vote", postId: "post-1", value: -1, idempotencyKey: "key-vote" })).envelope);
    await transport.clearVote((await createPendingEngagementRecord({ kind: "clear_vote", postId: "post-1", idempotencyKey: "key-clear" })).envelope);

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

    const envelope = (await createPendingEngagementRecord({ kind: "comment", postId: "post-1", body: "First", idempotencyKey: "key-comment" })).envelope;
    await expect(transport.createComment(envelope)).rejects.toMatchObject({
      code: "csrf_missing",
    });
    expect(client.post_postsPostIdComments).not.toHaveBeenCalled();
  });

  test("keeps retained bytes for every mutation while the generated client owns operation decoding", async () => {
    const seen: Array<{ readonly url: string; readonly body: string }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const bytes = init?.body instanceof ArrayBuffer ? new Uint8Array(init.body) : new Uint8Array();
      const url = input.toString();
      seen.push({ url, body: new TextDecoder().decode(bytes) });
      const response = url.endsWith("/comments/comment-1/replies")
        ? { ...commentResponse, surface: "reply" as const }
        : url.endsWith("/comments/comment-1/reports")
          ? { report_id: "report-1", case_ref: "case-1", status: "open" as const }
          : url.endsWith("/moderation/cases/case-1/actions")
            ? { action_id: "action-1", case_ref: "case-1", action: "hide" as const, target_status: "hidden" as const }
            : url.endsWith("/posts/post-1/vote")
              ? { post_id: "post-1", value: -1 as const }
              : url.endsWith("/posts/post-1/clear_vote")
                ? { post_id: "post-1", value: 0 as const }
                : commentResponse;
      return new Response(JSON.stringify(response), {
        status: url.includes("/comments") && !url.includes("/moderation/") ? 201 : 200,
        headers: { "content-type": "application/json" },
      });
    });
    const transport = createPostEngagementTransport({
      origin: "https://solid.example",
      fetchImpl,
      csrfToken: () => "csrf-token",
    });
    const comment = await createPendingEngagementRecord({
      kind: "comment",
      postId: "post-1",
      body: "First  with retained spacing",
      idempotencyKey: "key-comment",
    });
    const reply = await createPendingEngagementRecord({ kind: "reply", commentId: "comment-1", body: "Exact reply", idempotencyKey: "key-reply" });
    const report = await createPendingEngagementRecord({ kind: "report", commentId: "comment-1", reasonCode: "spam", idempotencyKey: "key-report" });
    const moderate = await createPendingEngagementRecord({ kind: "moderate", caseRef: "case-1", action: "hide", idempotencyKey: "key-action" });
    const vote = await createPendingEngagementRecord({ kind: "vote", postId: "post-1", value: -1, idempotencyKey: "key-vote" });
    const clearVote = await createPendingEngagementRecord({ kind: "clear_vote", postId: "post-1", idempotencyKey: "key-clear" });

    await expect(transport.createComment(comment.envelope)).resolves.toEqual(commentResponse);
    await transport.createReply(reply.envelope);
    await transport.reportComment(report.envelope);
    await transport.moderateCase(moderate.envelope);
    await transport.castVote(vote.envelope);
    await transport.clearVote(clearVote.envelope);
    expect(seen).toEqual([
      { url: "https://solid.example/api/posts/post-1/comments", body: "{\"idempotency_key\":\"key-comment\",\"body\":\"First  with retained spacing\"}" },
      { url: "https://solid.example/api/comments/comment-1/replies", body: "{\"idempotency_key\":\"key-reply\",\"body\":\"Exact reply\"}" },
      { url: "https://solid.example/api/comments/comment-1/reports", body: "{\"idempotency_key\":\"key-report\",\"reason_code\":\"spam\"}" },
      { url: "https://solid.example/api/moderation/cases/case-1/actions", body: "{\"idempotency_key\":\"key-action\",\"action\":\"hide\"}" },
      { url: "https://solid.example/api/posts/post-1/vote", body: "{\"idempotency_key\":\"key-vote\",\"value\":-1}" },
      { url: "https://solid.example/api/posts/post-1/clear_vote", body: "{\"idempotency_key\":\"key-clear\"}" },
    ]);
  });
});
