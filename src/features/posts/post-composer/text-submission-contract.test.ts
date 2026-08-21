import { describe, expect, test } from "vitest";

import {
  decodeTextContentSubmission,
  normalizeTextSubmissionRequest,
  serializeTextSubmissionRequest,
} from "./text-submission-contract";

const request = {
  path: { communityId: " community-1 " },
  body: {
    idempotency_key: "key-1",
    post_type: "text" as const,
    authorship_mode: "human_direct" as const,
    identity_mode: "public" as const,
    visibility: "public" as const,
    title: " Cafe\r\n",
    body: " e\u0301lan\rbody ",
  },
};

const published = {
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

describe("frozen text submission contract", () => {
  test("normalizes once before serialization and omits publish_mode", () => {
    const normalized = normalizeTextSubmissionRequest(request);
    expect(normalized).toEqual({
      path: { communityId: "community-1" },
      body: {
        idempotency_key: "key-1",
        post_type: "text",
        authorship_mode: "human_direct",
        identity_mode: "public",
        visibility: "public",
        title: "Cafe",
        body: "élan\nbody",
      },
    });
    const serialized = serializeTextSubmissionRequest(request);
    expect(new TextDecoder().decode(serialized.bytes)).not.toContain("publish_mode");
    expect(new TextDecoder().decode(serialized.bytes)).toBe(JSON.stringify(normalized.body));
  });

  test("accepts authoritative published snapshots and rejects inconsistent fields", () => {
    expect(decodeTextContentSubmission(published)).toEqual(published);
    expect(() => decodeTextContentSubmission({ ...published, published_resource: null })).toThrow();
    expect(() => decodeTextContentSubmission({
      ...published,
      status: "manual_review",
      result: { decision: "manual_review", reason_code: "review_required" },
      review_ref: null,
    })).toThrow();
  });
});
