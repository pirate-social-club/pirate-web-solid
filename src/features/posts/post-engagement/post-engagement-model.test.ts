import { ApiClientError } from "@pirate/api-client";
import { describe, expect, test } from "vitest";

import {
  applyModerationOutcome,
  adjustReplyCount,
  canReplyToComment,
  mapEngagementIssue,
  nextVoteScore,
  settledComment,
  submittingComment,
} from "./post-engagement-model.ts";

function conflict(name: "IdempotencyConflict" | "PostVoteIdempotencyConflict", identity: string) {
  const identityKey = name === "IdempotencyConflict" ? "submission_id" : "action_id";
  return new ApiClientError(
    { status: 409, code: "conflict", name, retryable: false },
    {
      error: {
        code: "conflict",
        message: "key conflict",
        retryable: false,
        details: { reason_code: "idempotency_conflict", [identityKey]: identity },
      },
    },
  );
}

describe("post engagement model", () => {
  test("maps submission and moderation outcomes into explicit UI states", () => {
    const pending = submittingComment("hello", 0, null, "key-1");
    const held = settledComment(pending, {
      submission_id: "submission-1",
      href: "/submissions/submission-1",
      surface: "comment",
      status: "manual_review",
      result: { decision: "manual_review", reason_code: "review_required" },
      published_resource: null,
      review_ref: "case-1",
      created_at: "2026-08-22T00:00:00.000Z",
      updated_at: "2026-08-22T00:00:00.000Z",
    });
    expect(held).toMatchObject({ id: "submission:submission-1", state: "manual_review", caseRef: "case-1" });
    expect(applyModerationOutcome(held, {
      action_id: "action-1",
      case_ref: "case-1",
      action: "approve",
      target_status: "published",
    })).toMatchObject({ state: "published", caseRef: null, lastModerationAction: "approve" });
    expect(applyModerationOutcome({ ...held, state: "published" }, {
      action_id: "action-2",
      case_ref: "case-1",
      action: "hide",
      target_status: "hidden",
    }).state).toBe("hidden");
  });

  test("enforces depth eight and maintains reply and vote aggregates", () => {
    const depthEight = { ...submittingComment("deep", 8, null, "key-8"), id: "comment-8", state: "published" as const };
    expect(canReplyToComment(depthEight)).toBe(false);
    expect(adjustReplyCount([depthEight], "comment-8", 1)[0]?.replyCount).toBe(1);
    expect(adjustReplyCount([{ ...depthEight, replyCount: 1 }], "comment-8", -1)[0]?.replyCount).toBe(0);
    expect(nextVoteScore(4, 1, -1)).toBe(2);
    expect(nextVoteScore(2, -1, null)).toBe(3);
  });

  test("preserves typed conflict identity for comment and vote retries", () => {
    expect(mapEngagementIssue(conflict("IdempotencyConflict", "submission-1"))).toEqual({
      kind: "idempotency_conflict",
      identity: "submission-1",
    });
    expect(mapEngagementIssue(conflict("PostVoteIdempotencyConflict", "action-1"))).toEqual({
      kind: "idempotency_conflict",
      identity: "action-1",
    });
  });
});
