import { describe, expect, test } from "vitest";

import { pendingBodyBytes } from "../post-composer/pending-submission.ts";
import {
  commentSubmissionSlot,
  createMemoryPendingEngagementStorage,
  createPendingEngagementRecord,
  decodePendingEngagementAction,
  PendingEngagementConflictError,
  postVoteSlot,
} from "./post-engagement-pending.ts";

describe("pending post engagement", () => {
  test("retains one serialized comment body and key byte-for-byte across reload", async () => {
    const backing = { records: new Map() };
    const firstSession = createMemoryPendingEngagementStorage(backing);
    const record = await createPendingEngagementRecord({
      kind: "comment",
      postId: "post-1",
      body: "Keep  spacing and punctuation!",
      idempotencyKey: "comment-key",
    });
    await firstSession.saveNew(record);

    const secondSession = createMemoryPendingEngagementStorage(backing);
    const restored = await secondSession.load(commentSubmissionSlot("post-1"));
    expect(restored).not.toBeNull();
    if (restored === null) throw new Error("pending record missing after reload");
    expect(restored.envelope).toEqual(record.envelope);
    expect(pendingBodyBytes(restored.envelope)).toEqual(pendingBodyBytes(record.envelope));
    expect(new TextDecoder().decode(pendingBodyBytes(restored.envelope))).toBe(
      "{\"idempotency_key\":\"comment-key\",\"body\":\"Keep  spacing and punctuation!\"}",
    );
    expect(await decodePendingEngagementAction(restored.envelope)).toEqual({
      kind: "comment",
      postId: "post-1",
      body: "Keep  spacing and punctuation!",
      idempotencyKey: "comment-key",
    });
  });

  test("does not replace an unresolved slot with a new vote intent", async () => {
    const storage = createMemoryPendingEngagementStorage();
    const first = await createPendingEngagementRecord({ kind: "vote", postId: "post-1", value: 1, idempotencyKey: "up-key" });
    const second = await createPendingEngagementRecord({ kind: "vote", postId: "post-1", value: -1, idempotencyKey: "down-key" });
    await storage.saveNew(first);
    await expect(storage.saveNew(second)).rejects.toBeInstanceOf(PendingEngagementConflictError);
    const retained = await storage.load(postVoteSlot("post-1"));
    expect(retained?.envelope.idempotency_key).toBe("up-key");
  });
});

