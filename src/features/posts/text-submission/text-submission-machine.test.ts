import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";

import { createPendingSubmissionEnvelope } from "../post-composer/pending-submission";
import type { TextContentSubmissionV1 } from "../post-composer/text-submission-contract";
import {
  AmbiguousTextSubmissionError,
  IdempotencyConflictError,
  TextSubmissionServerRejectionError,
  type TextSubmissionTransport,
} from "../post-composer/text-submission-transport";
import { ATTEMPT_TIMEOUT_MS, createTextSubmissionMachine, DELAYED_AFTER_ATTEMPTS, retryDelayMs } from "./text-submission-machine";

const published: TextContentSubmissionV1 = {
  submission_id: "sub-1",
  href: "/text-content-submissions/sub-1",
  surface: "text_post",
  status: "published",
  result: { decision: "allow", reason_code: null },
  published_resource: { kind: "post", post_id: "post-1", href: "/posts/post-1" },
  review_ref: null,
  created_at: "2026-10-06T00:00:00Z",
  updated_at: "2026-10-06T00:00:00Z",
};
const held: TextContentSubmissionV1 = {
  ...published,
  status: "manual_review",
  result: { decision: "manual_review", reason_code: "review_required" },
  published_resource: null,
  review_ref: "review-1",
};

async function envelope() {
  return createPendingSubmissionEnvelope({
    request: {
      path: { communityId: "community-1" },
      body: {
        idempotency_key: "key-1",
        persona_id: "persona-1",
        post_type: "text",
        authorship_mode: "human_direct",
        identity_mode: "public",
        visibility: "public",
        author_declared_rating: "general",
        title: null,
        body: "Hello world",
      },
    },
    pendingRequestId: "pending-1",
    createdAt: "2026-10-06T00:00:00.000Z",
  });
}

async function run(transport: TextSubmissionTransport) {
  const actor = createActor(createTextSubmissionMachine(transport), { input: { envelope: await envelope() } });
  actor.start();
  return actor;
}

describe("text submission machine", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("publishes on the first answer", async () => {
    const dispatch = vi.fn(async () => published);
    const actor = await run({ dispatch, read: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(actor.getSnapshot().value).toBe("published");
    expect(actor.getSnapshot().context.postId).toBe("post-1");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("replays the same request after a lost acknowledgement and confirms", async () => {
    const dispatch = vi.fn()
      .mockRejectedValueOnce(new AmbiguousTextSubmissionError())
      .mockResolvedValueOnce(published);
    const actor = await run({ dispatch, read: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(actor.getSnapshot().value).toBe("waiting");
    await vi.advanceTimersByTimeAsync(retryDelayMs(1));
    expect(actor.getSnapshot().value).toBe("published");
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[1]![0]).toBe(dispatch.mock.calls[0]![0]);
  });

  it("keeps trying while the connection is down and never reports a refusal", async () => {
    const dispatch = vi.fn(async () => { throw new AmbiguousTextSubmissionError(); });
    const actor = await run({ dispatch, read: vi.fn() });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(actor.getSnapshot().context.attempts).toBeGreaterThanOrEqual(DELAYED_AFTER_ATTEMPTS);
    expect(actor.getSnapshot().context.rejection).toBeNull();
    expect(actor.getSnapshot().status).toBe("active");
    actor.stop();
  });

  it("treats an unanswered request as unconfirmed and replays it", async () => {
    const dispatch = vi.fn()
      .mockImplementationOnce(() => new Promise<never>(() => {}))
      .mockResolvedValueOnce(published);
    const actor = await run({ dispatch, read: vi.fn() });
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS);
    expect(actor.getSnapshot().value).toBe("waiting");
    expect(actor.getSnapshot().context.rejection).toBeNull();
    await vi.advanceTimersByTimeAsync(retryDelayMs(1));
    expect(actor.getSnapshot().value).toBe("published");
    expect(dispatch.mock.calls[1]![0]).toBe(dispatch.mock.calls[0]![0]);
  });

  it("retries at once when asked", async () => {
    const dispatch = vi.fn()
      .mockRejectedValueOnce(new AmbiguousTextSubmissionError())
      .mockResolvedValueOnce(published);
    const actor = await run({ dispatch, read: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    actor.send({ type: "RETRY" });
    await vi.advanceTimersByTimeAsync(0);
    expect(actor.getSnapshot().value).toBe("published");
  });

  it("stops on a definitive refusal", async () => {
    const dispatch = vi.fn(async () => { throw new TextSubmissionServerRejectionError(403, "membership_required"); });
    const actor = await run({ dispatch, read: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(actor.getSnapshot().value).toBe("rejected");
    expect(actor.getSnapshot().context.rejection).toBe("not_allowed");
  });

  it("reads the bound submission after an idempotency conflict instead of sending again", async () => {
    const dispatch = vi.fn(async () => { throw new IdempotencyConflictError("sub-1"); });
    const read = vi.fn(async () => published);
    const actor = await run({ dispatch, read });
    await vi.advanceTimersByTimeAsync(retryDelayMs(1));
    expect(actor.getSnapshot().value).toBe("published");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith("sub-1");
  });

  it("reports a held post as held, not published", async () => {
    const actor = await run({ dispatch: vi.fn(async () => held), read: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(actor.getSnapshot().value).toBe("rejected");
    expect(actor.getSnapshot().context.rejection).toBe("held");
  });
});
