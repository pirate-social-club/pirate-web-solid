import assert from "node:assert/strict";
import test from "node:test";
import { HappyPathReceipt, cspAllowsAudioHost, fixtureSha256 } from "../e2e/fixtures/happy-path-receipt.ts";

const pageFrame = {};

const request = (overrides = {}) => ({
  method: () => overrides.method ?? "GET",
  resourceType: () => overrides.resourceType ?? "media",
  headers: () => ({ range: "bytes=0-1", ...overrides.headers }),
  frame: () => overrides.frame ?? pageFrame,
  url: () => overrides.url ?? "https://cdn.audio.example/signed?token=private",
});

const response = (overrides = {}) => ({
  headers: () => ({
    "content-security-policy": "default-src 'self'; media-src https://*.audio.example",
    "content-type": "audio/mpeg",
    "content-range": "bytes 0-1/42",
    ...overrides.headers,
  }),
  request: () => overrides.request ?? request(),
  status: () => overrides.status ?? 206,
  url: () => overrides.url ?? "https://cdn.audio.example/signed?token=private",
  json: async () => overrides.body ?? {},
});

const documentResponse = (headers, frame = pageFrame) => response({
  request: request({ method: "GET", resourceType: "document", frame, headers: {} }),
  headers: { "content-security-policy": undefined, ...headers },
  url: "https://web-next-staging.pirate.sc/community",
});

test("CSP host matching accepts the observed audio host and rejects another host", () => {
  const policy = "default-src 'self'; media-src https://*.audio.example";
  assert.equal(cspAllowsAudioHost(policy, "cdn.audio.example"), true);
  assert.equal(cspAllowsAudioHost(policy, "cdn.other.example"), false);
});

test("receipt retains only safe media evidence and counts lyric requests", () => {
  const fixture = Buffer.from("instrumental-fixture");
  const receipt = new HappyPathReceipt(
    { id: "m1-a1-01234567-89ab-cdef-0123-456789abcdef", number: "1", role: "owner", started_at: "2026-09-15T12:34:56.000Z" },
    "manifest-sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "2026-09-15T12:34:56.000Z",
    "test-account.r2.cloudflarestorage.com",
    fixture,
  );
  receipt.observeRequest({
    method: () => "POST",
    url: () => "https://web-next-staging.pirate.sc/api/media-post-submissions/private/lyrics",
  });
  receipt.observeResponse(documentResponse({
    "content-security-policy": "default-src 'self'; media-src https://*.audio.example",
  }));
  receipt.observeResponse(response());
  receipt.recordResourceId("community_id", "community-123");
  receipt.recordResourceId("song_submission_id", "submission-123");
  receipt.finalize("failed");
  const snapshot = receipt.snapshot();
  assert.equal(snapshot.fixture.sha256, fixtureSha256(fixture));
  assert.equal(snapshot.fixture.classification, "instrumental_audio");
  assert.equal(snapshot.lyrics.request_count, 1);
  assert.equal(snapshot.lyrics.persisted_state, null);
  assert.deepEqual(snapshot.resources, { community_id: "community-123", song_submission_id: "submission-123" });
  assert.equal(snapshot.signed_audio.hostname, "cdn.audio.example");
  assert.equal(snapshot.signed_audio.expected_hostname, "test-account.r2.cloudflarestorage.com");
  assert.equal(snapshot.signed_audio.range_status, 206);
  assert.equal(snapshot.signed_audio.content_type, "audio/mpeg");
  assert.equal(snapshot.signed_audio.content_range, "bytes 0-1/42");
  assert.equal(snapshot.signed_audio.csp_host_match, true);
  const serialized = JSON.stringify(snapshot);
  for (const secret of ["private", "token=", "signed?"]) assert.equal(serialized.includes(secret), false);
});

test("captures the bounded creation submission ID when terms never arrives", async () => {
  const receipt = new HappyPathReceipt(
    { id: "m1-a1-01234567-89ab-cdef-0123-456789abcdef", number: "1", role: "owner", started_at: "2026-09-15T12:34:56.000Z" },
    "manifest-sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "2026-09-15T12:34:56.000Z",
    "test-account.r2.cloudflarestorage.com",
    Buffer.from("fixture"),
  );
  receipt.observeResponse(response({
    request: request({ method: "POST", resourceType: "fetch" }),
    url: "https://web-next-staging.pirate.sc/api/communities/community-123/media-post-submissions",
    status: 201,
    body: { submission_id: "created-before-terms" },
  }));
  await receipt.flushResponseReads();
  assert.equal(receipt.snapshot().resources.song_submission_id, "created-before-terms");
});

test("Report-Only CSP cannot authorize the playing audio source", () => {
  const receipt = new HappyPathReceipt(
    { id: "m1-a1-01234567-89ab-cdef-0123-456789abcdef", number: "1", role: "owner", started_at: "2026-09-15T12:34:56.000Z" },
    "manifest-sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "2026-09-15T12:34:56.000Z",
    "test-account.r2.cloudflarestorage.com",
    Buffer.from("fixture"),
  );
  receipt.observeResponse(documentResponse({
    "content-security-policy-report-only": "default-src 'self'; media-src https://*.audio.example",
  }));
  receipt.observeResponse(response());
  assert.equal(receipt.snapshot().signed_audio.csp_host_match, false);
});

test("a stale document policy cannot authorize audio after navigation", () => {
  const receipt = new HappyPathReceipt(
    { id: "m1-a1-01234567-89ab-cdef-0123-456789abcdef", number: "1", role: "owner", started_at: "2026-09-15T12:34:56.000Z" },
    "manifest-sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "2026-09-15T12:34:56.000Z",
    "test-account.r2.cloudflarestorage.com",
    Buffer.from("fixture"),
  );
  receipt.observeResponse(documentResponse({
    "content-security-policy": "default-src 'self'; media-src https://old.audio.example",
  }));
  receipt.observeResponse(documentResponse({
    "content-security-policy": "default-src 'self'; media-src https://current.audio.example",
  }));
  receipt.observeResponse(response({
    url: "https://old.audio.example/signed?token=private",
    request: request({ frame: pageFrame }),
  }));
  assert.equal(receipt.snapshot().signed_audio.csp_host_match, false);
});
