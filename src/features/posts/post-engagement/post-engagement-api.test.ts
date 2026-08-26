import { describe, expect, test, vi } from "vitest";

import { bytesToBase64Url, sha256Hex } from "../post-composer/text-submission-contract.ts";
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

const context = { principalId: "persona-1", postId: "post-1" } as const;

describe("createPostEngagementTransport", () => {
  test("fails locally before calling the API when CSRF state is absent", async () => {
    const fetchImpl = vi.fn();
    const transport = createPostEngagementTransport({ fetchImpl, csrfToken: () => undefined });

    const envelope = (await createPendingEngagementRecord({ kind: "comment", postId: "post-1", body: "First", idempotencyKey: "key-comment" }, context)).envelope;
    await expect(transport.createComment(envelope)).rejects.toMatchObject({
      code: "csrf_missing",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
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
    }, context);
    const rawComment = '{\n  "body" : "First  with retained spacing",\n  "idempotency_key" : "key-comment"\n}';
    const rawCommentBytes = new TextEncoder().encode(rawComment);
    const exactCommentEnvelope = {
      ...comment.envelope,
      body_utf8_base64url: bytesToBase64Url(rawCommentBytes),
      body_sha256: await sha256Hex(rawCommentBytes),
    };
    const reply = await createPendingEngagementRecord({ kind: "reply", commentId: "comment-1", body: "Exact reply", idempotencyKey: "key-reply" }, context);
    const report = await createPendingEngagementRecord({ kind: "report", commentId: "comment-1", reasonCode: "spam", idempotencyKey: "key-report" }, context);
    const moderate = await createPendingEngagementRecord({ kind: "moderate", caseRef: "case-1", action: "hide", idempotencyKey: "key-action" }, context);
    const vote = await createPendingEngagementRecord({ kind: "vote", postId: "post-1", value: -1, idempotencyKey: "key-vote" }, context);
    const clearVote = await createPendingEngagementRecord({ kind: "clear_vote", postId: "post-1", idempotencyKey: "key-clear" }, context);

    await expect(transport.createComment(exactCommentEnvelope)).resolves.toEqual(commentResponse);
    await transport.createReply(reply.envelope);
    await transport.reportComment(report.envelope);
    await transport.moderateCase(moderate.envelope);
    await transport.castVote(vote.envelope);
    await transport.clearVote(clearVote.envelope);
    expect(seen).toEqual([
      { url: "https://solid.example/api/posts/post-1/comments", body: rawComment },
      { url: "https://solid.example/api/comments/comment-1/replies", body: "{\"idempotency_key\":\"key-reply\",\"body\":\"Exact reply\"}" },
      { url: "https://solid.example/api/comments/comment-1/reports", body: "{\"idempotency_key\":\"key-report\",\"reason_code\":\"spam\"}" },
      { url: "https://solid.example/api/moderation/cases/case-1/actions", body: "{\"idempotency_key\":\"key-action\",\"action\":\"hide\"}" },
      { url: "https://solid.example/api/posts/post-1/vote", body: "{\"idempotency_key\":\"key-vote\",\"value\":-1}" },
      { url: "https://solid.example/api/posts/post-1/clear_vote", body: "{\"idempotency_key\":\"key-clear\"}" },
    ]);
  });
});
