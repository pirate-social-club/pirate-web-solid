import { describe, expect, test, vi } from "vitest";

import {
  assertSafeSameOriginPath,
  createPendingSubmissionEnvelope,
  pendingBodyBytes,
  PendingSubmissionError,
  validatePendingSubmissionEnvelope,
  type PendingSubmissionEnvelopeV1,
} from "./pending-submission";
import {
  createTextSubmissionCoordinator,
  IdempotencyConflictError,
  TextSubmissionServerRejectionError,
} from "./text-submission-transport";
import type { TextContentSubmissionV1 } from "./text-submission-contract";

const request = {
  path: { communityId: "community-1" },
  body: {
    idempotency_key: "key-1",
    persona_id: "persona-one",
    post_type: "text" as const,
    authorship_mode: "human_direct" as const,
    identity_mode: "public" as const,
    visibility: "public" as const,
    author_declared_rating: "general" as const,
    title: null,
    body: "Hello pirate",
  },
};

const published: TextContentSubmissionV1 = {
  submission_id: "sub-1",
  href: "/text-content-submissions/sub-1",
  surface: "text_post",
  status: "published",
  result: { decision: "allow", reason_code: null },
  published_resource: { kind: "post", post_id: "post-1", href: "/posts/post-1" },
  review_ref: null,
  created_at: "2026-08-21T00:00:00Z",
  updated_at: "2026-08-21T00:00:00Z",
};

async function envelope(pendingRequestId = "pending-1"): Promise<PendingSubmissionEnvelopeV1> {
  return createPendingSubmissionEnvelope({
    request,
    sameOriginPath: "/api/communities/community-1/posts",
    pendingRequestId,
    createdAt: "2026-08-21T00:00:00Z",
  });
}

describe("pending submission envelope", () => {
  test("binds the idempotency key, path, and exact request bytes", async () => {
    const value = await envelope();
    expect(value.idempotency_key).toBe("key-1");
    expect(value.same_origin_path).toBe("/api/communities/community-1/posts");
    expect(JSON.parse(new TextDecoder().decode(pendingBodyBytes(value)))).toMatchObject({
      idempotency_key: "key-1",
      body: "Hello pirate",
    });
  });

  test("rejects unsafe same-origin paths", () => {
    for (const path of ["https://elsewhere.test/api/posts", "/api/../secrets", "/api/posts?x=1", "//api/posts"]) {
      expect(() => assertSafeSameOriginPath(path)).toThrow(PendingSubmissionError);
    }
  });

  test("validates a retained envelope's digest and key binding", async () => {
    const value = await envelope();
    await expect(validatePendingSubmissionEnvelope(value)).resolves.toEqual(value);
    await expect(validatePendingSubmissionEnvelope({ ...value, body_sha256: "0".repeat(64) }))
      .rejects.toThrow("Pending body hash does not match");
    await expect(validatePendingSubmissionEnvelope({ ...value, idempotency_key: "other-key" }))
      .rejects.toThrow("Pending body idempotency key does not match");
  });
});

describe("text submission coordinator", () => {
  test("dispatches the request once and projects the authoritative outcome", async () => {
    const dispatch = vi.fn(async () => published);
    const coordinator = createTextSubmissionCoordinator({
      transport: { dispatch, read: async () => null },
    });
    await expect(coordinator.submit(request)).resolves.toEqual(published);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(coordinator.state).toEqual({ status: "published", submission_id: "sub-1", post_href: "/posts/post-1" });
  });

  test("replays the exact retained bytes after an ambiguous response", async () => {
    const sent: PendingSubmissionEnvelopeV1[] = [];
    let attempt = 0;
    const coordinator = createTextSubmissionCoordinator({
      transport: {
        dispatch: async (value) => {
          sent.push(value);
          if (++attempt === 1) throw new Error("network uncertain");
          return published;
        },
        read: async () => null,
      },
    });
    await expect(coordinator.submit(request)).rejects.toThrow("network uncertain");
    expect(coordinator.state).toEqual({ status: "reconciling", pending_request_id: expect.any(String) });
    await expect(coordinator.reconcile()).resolves.toEqual(published);
    expect(sent).toHaveLength(2);
    expect(sent[1]!.idempotency_key).toBe(sent[0]!.idempotency_key);
    expect(sent[1]!.body_sha256).toBe(sent[0]!.body_sha256);
  });

  test("reads a known submission after an idempotency conflict instead of rebuilding it", async () => {
    const read = vi.fn(async () => published);
    const coordinator = createTextSubmissionCoordinator({
      transport: {
        dispatch: async () => { throw new IdempotencyConflictError("sub-existing"); },
        read,
      },
    });
    await expect(coordinator.submit(request)).rejects.toBeInstanceOf(IdempotencyConflictError);
    expect(coordinator.state).toMatchObject({ status: "reconciling", submission_id: "sub-existing" });
    await expect(coordinator.reconcile()).resolves.toEqual(published);
    expect(read).toHaveBeenCalledWith("sub-existing");
  });

  test("returns to editing on a definitive rejection and releases the request", async () => {
    const coordinator = createTextSubmissionCoordinator({
      transport: {
        dispatch: async () => { throw new TextSubmissionServerRejectionError(403, "membership_required", true); },
        read: async () => null,
      },
    });
    await expect(coordinator.submit(request)).rejects.toBeInstanceOf(TextSubmissionServerRejectionError);
    expect(coordinator.state).toEqual({ status: "editing" });
    await expect(coordinator.reconcile()).rejects.toThrow("No unresolved text submission");
  });

  test("refuses a second submission while one is unresolved", async () => {
    const coordinator = createTextSubmissionCoordinator({
      transport: {
        dispatch: async () => { throw new Error("network uncertain"); },
        read: async () => null,
      },
    });
    await expect(coordinator.submit(request)).rejects.toThrow("network uncertain");
    await expect(coordinator.submit(request)).rejects.toThrow("An unresolved submission must be reconciled");
  });
});
