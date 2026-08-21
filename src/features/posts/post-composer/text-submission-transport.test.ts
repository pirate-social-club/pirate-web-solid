import { describe, expect, test, vi } from "vitest";

import {
  createPendingSubmissionEnvelope,
  pendingBodyBytes,
} from "./pending-submission";
import {
  createSameOriginTextSubmissionTransport,
  IdempotencyConflictError,
  TextSubmissionServerRejectionError,
} from "./text-submission-transport";

const request = {
  path: { communityId: "community-1" },
  body: {
    idempotency_key: "key-1",
    post_type: "text" as const,
    authorship_mode: "human_direct" as const,
    identity_mode: "public" as const,
    visibility: "public" as const,
    title: null,
    body: "Hello pirate",
  },
};

const snapshot = {
  submission_id: "sub-1",
  href: "/text-content-submissions/sub-1",
  surface: "text_post" as const,
  status: "published" as const,
  result: { decision: "allow" as const, reason_code: null },
  published_resource: { kind: "post" as const, post_id: "post-1", href: "/posts/post-1" },
  review_ref: null,
  created_at: "2026-08-21T00:00:00Z",
  updated_at: "2026-08-21T00:00:00Z",
};

async function envelope() {
  return createPendingSubmissionEnvelope({
    request,
    sameOriginPath: "/api/communities/community-1/posts",
    pendingRequestId: "pending-1",
    createdAt: "2026-08-21T00:00:00Z",
  });
}

describe("same-origin text transport", () => {
  test("rejects malformed method and content type before fetch", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(snapshot), { status: 201 }));
    const transport = createSameOriginTextSubmissionTransport({ origin: "https://pirate.test", fetchImpl });
    const badMethod = await envelope();
    Object.defineProperty(badMethod, "method", { value: "PUT" });
    await expect(transport.dispatch(badMethod)).rejects.toMatchObject({ name: "PendingSubmissionError" });
    const badContentType = await envelope();
    Object.defineProperty(badContentType, "content_type", { value: "text/plain" });
    await expect(transport.dispatch(badContentType)).rejects.toMatchObject({ name: "PendingSubmissionError" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("sends the retained bytes unchanged and decodes an authoritative snapshot", async () => {
    const sent: Uint8Array[] = [];
    let sentHeaders: Headers | undefined;
    const transport = createSameOriginTextSubmissionTransport({
      origin: "https://pirate.test",
      fetchImpl: async (_input, init) => {
        sent.push(new Uint8Array(await new Response(init?.body).arrayBuffer()));
        sentHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify(snapshot), { status: 201, headers: { "content-type": "application/json" } });
      },
    });
    const pending = await envelope();
    await expect(transport.dispatch(pending)).resolves.toEqual(snapshot);
    expect(sent[0]).toEqual(pendingBodyBytes(pending));
    expect(sentHeaders?.has("idempotency-key")).toBe(false);
  });

  test.each([200, 202])("rejects POST HTTP %s instead of treating it as authoritative", async status => {
    const transport = createSameOriginTextSubmissionTransport({
      origin: "https://pirate.test",
      fetchImpl: async () => new Response(JSON.stringify(snapshot), { status }),
    });
    await expect(transport.dispatch(await envelope())).rejects.toMatchObject({
      name: "TextSubmissionServerRejectionError",
      status,
      code: "unexpected_status",
    });
  });

  test("keeps malformed success responses ambiguous", async () => {
    const transport = createSameOriginTextSubmissionTransport({
      origin: "https://pirate.test",
      fetchImpl: async () => new Response("{not-json", { status: 201 }),
    });
    await expect(transport.dispatch(await envelope())).rejects.toThrow("malformed JSON");
  });

  test("parses only the strict wire conflict and 400/403 rejection shapes", async () => {
    const conflict = createSameOriginTextSubmissionTransport({
      origin: "https://pirate.test",
      fetchImpl: async () => new Response(JSON.stringify({ _tag: "idempotency_conflict", submission_id: "sub-existing" }), { status: 409 }),
    });
    await expect(conflict.dispatch(await envelope())).rejects.toMatchObject({ name: "AmbiguousTextSubmissionError" });
    const typedConflict = createSameOriginTextSubmissionTransport({
      origin: "https://pirate.test",
      fetchImpl: async () => new Response(JSON.stringify({
        error: {
          code: "conflict",
          message: "Idempotency key was already used",
          retryable: false,
          details: { reason_code: "idempotency_conflict", submission_id: "sub-existing" },
        },
        request_id: "request-1",
      }), { status: 409 }),
    });
    await expect(typedConflict.dispatch(await envelope())).rejects.toMatchObject({
      name: "IdempotencyConflictError",
      submission_id: "sub-existing",
    } satisfies Partial<IdempotencyConflictError>);
    const malformedConflict = createSameOriginTextSubmissionTransport({
      origin: "https://pirate.test",
      fetchImpl: async () => new Response(JSON.stringify({
        error: {
          code: "conflict",
          message: "Idempotency key was already used",
          retryable: false,
          details: { reason_code: "idempotency_conflict", submission_id: "sub-existing", extra: true },
        },
      }), { status: 409 }),
    });
    await expect(malformedConflict.dispatch(await envelope())).rejects.toMatchObject({ name: "AmbiguousTextSubmissionError" });
    const badRequest = createSameOriginTextSubmissionTransport({
      origin: "https://pirate.test",
      fetchImpl: async () => new Response(JSON.stringify({ error: { code: "bad_request", message: "invalid", retryable: false } }), { status: 400 }),
    });
    await expect(badRequest.dispatch(await envelope())).rejects.toMatchObject({
      name: "TextSubmissionServerRejectionError",
      status: 400,
      code: "bad_request",
    } satisfies Partial<TextSubmissionServerRejectionError>);
    const untyped = createSameOriginTextSubmissionTransport({
      origin: "https://pirate.test",
      fetchImpl: async () => new Response(JSON.stringify({ error: { code: "bad_request" } }), { status: 422 }),
    });
    await expect(untyped.dispatch(await envelope())).rejects.toMatchObject({ name: "AmbiguousTextSubmissionError" });
  });

  test("reads a known submission through the canonical same-origin GET", async () => {
    const requests: string[] = [];
    const transport = createSameOriginTextSubmissionTransport({
      origin: "https://pirate.test",
      fetchImpl: async input => {
        requests.push(new URL(input.toString()).pathname);
        return new Response(JSON.stringify(snapshot), { status: 200 });
      },
    });
    await expect(transport.read("sub-known")).resolves.toEqual(snapshot);
    expect(requests).toEqual(["/api/text-content-submissions/sub-known"]);
  });

  test("maps the generated GET client's declared 404 to no snapshot", async () => {
    const transport = createSameOriginTextSubmissionTransport({
      origin: "https://pirate.test",
      fetchImpl: async () => new Response(JSON.stringify({
        error: { code: "not_found", message: "missing", retryable: false },
        request_id: "request-404",
      }), { status: 404 }),
    });
    await expect(transport.read("sub-missing")).resolves.toBeNull();
  });

  test.each([201, 202])("rejects GET HTTP %s instead of accepting a non-200 snapshot", async status => {
    const transport = createSameOriginTextSubmissionTransport({
      origin: "https://pirate.test",
      fetchImpl: async () => new Response(JSON.stringify(snapshot), { status }),
    });
    await expect(transport.read("sub-known")).rejects.toMatchObject({ name: "AmbiguousTextSubmissionError" });
  });

  test.each([400, 403, 409, 500])("keeps GET HTTP %s ambiguous even with a typed-looking body", async status => {
    const transport = createSameOriginTextSubmissionTransport({
      origin: "https://pirate.test",
      fetchImpl: async () => new Response(JSON.stringify({ error: { code: "bad_request", message: "invalid", retryable: false } }), { status }),
    });
    await expect(transport.read("sub-known")).rejects.toMatchObject({ name: "AmbiguousTextSubmissionError" });
  });

  test("rejects a non-origin client URL before dispatch", async () => {
    expect(() => createSameOriginTextSubmissionTransport({ origin: "https://pirate.test/app" })).not.toThrow();
    const transport = createSameOriginTextSubmissionTransport({
      origin: "https://pirate.test/app",
      fetchImpl: async () => new Response(JSON.stringify(snapshot), { status: 200 }),
    });
    await expect(transport.read("sub-known")).rejects.toThrow("must be an origin");
  });
});
