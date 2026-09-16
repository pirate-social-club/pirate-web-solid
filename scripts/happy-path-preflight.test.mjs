import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { happyPathAttemptContext, stagingPairEvidence } from "../e2e/fixtures/happy-path-preflight.ts";

const pair = [
  "api:http:abe210e06dd52d045119dac8b8dde87d156cf450@b29dff42-635e-4daa-b19d-dd883785b606",
  "api:data-registration:abe210e06dd52d045119dac8b8dde87d156cf450@baea6f5e-7a3a-4379-a915-f3a87d6c3a8a",
  "api:media-processor:abe210e06dd52d045119dac8b8dde87d156cf450@df0f3895-e3c2-497e-ba4e-523b96749444",
  "api:jobs:abe210e06dd52d045119dac8b8dde87d156cf450@59e86716-43ef-4308-bd96-b7a466331e38",
  "solid:67dcf130cd366bdf505c1a62f169dc1aefff57e3@eafdfe9c-22e6-460b-b93a-44b66ece495e",
].join("|");

const apiSource = "abe210e06dd52d045119dac8b8dde87d156cf450";
const worker = (version, extra = {}) => ({
  source_commit: apiSource,
  version_id: version,
  traffic_percent: 100,
  public_health: { status: "not_applicable" },
  ...extra,
});
const manifest = JSON.stringify({ observed: {
  at: "2026-09-15T13:51:05.000Z",
  pair_id: pair,
  api: {
    source_commit: apiSource,
    workers: {
      http: worker("b29dff42-635e-4daa-b19d-dd883785b606", {
        health: { status: 200 },
        deployed_flags: {
          SONG_PLAYBACK_ENABLED: "true",
          SONG_PLAYBACK_R2_ACCOUNT_ID: "test-account",
          SONG_PLAYBACK_R2_BUCKET: "test-bucket",
        },
      }),
      data_registration: worker("baea6f5e-7a3a-4379-a915-f3a87d6c3a8a"),
      media_processor: worker("df0f3895-e3c2-497e-ba4e-523b96749444"),
      jobs: worker("59e86716-43ef-4308-bd96-b7a466331e38"),
    },
  },
  solid: {
    source_commit: "67dcf130cd366bdf505c1a62f169dc1aefff57e3",
    version_id: "eafdfe9c-22e6-460b-b93a-44b66ece495e",
    traffic_percent: 100,
    health: {
      "/": { status: 200 },
      "/auth/sign-in": { status: 200 },
    },
  },
} }, null, 2);
const manifestPath = join(mkdtempSync(join(tmpdir(), "happy-path-manifest-")), "staging-serving-pair.json");
writeFileSync(manifestPath, manifest);
const manifestDigest = createHash("sha256").update(manifest).digest("hex");

const configured = {
  E2E_ALLOW_MUTATION: "1",
  E2E_FRESH_PRIVY_ACCOUNT: "1",
  E2E_PRIVY_EMAIL: "member@example.invalid",
  E2E_PRIVY_OTP: "123456",
  E2E_BASE_URL: "https://web-next-staging.pirate.sc",
  E2E_STAGING_PAIR_OBSERVED: "1",
  E2E_STAGING_PAIR_ID: pair,
  E2E_STAGING_MANIFEST_PATH: manifestPath,
  E2E_STAGING_MANIFEST_SHA256: manifestDigest,
  E2E_ATTEMPT_ID: "m1-a2-01234567-89ab-cdef-0123-456789abcdef",
  E2E_ATTEMPT_NUMBER: "2",
  E2E_ATTEMPT_ROLE: "member",
  E2E_ATTEMPT_SLOT: "member",
  E2E_ATTEMPT_STARTED_AT: "2026-09-15T12:34:56.000Z",
};

test("accepts the full observed multi-worker pair identifier without truncation", () => {
  const context = happyPathAttemptContext(configured);
  assert.equal(context.releaseReference, `manifest-sha256:${manifestDigest}`);
  assert.equal(context.manifestDigest, manifestDigest);
  assert.equal(context.manifestObservedAt, "2026-09-15T13:51:05.000Z");
  assert.equal(context.playbackHost, "test-account.r2.cloudflarestorage.com");
  assert.equal(context.number, "2");
  assert.equal(context.role, "member");
  assert.equal(context.identitySlot, "member");
  assert.equal(context.startedAt, "2026-09-15T12:34:56.000Z");
});

test("requires the secret-runner attempt context and rejects operator variables", () => {
  assert.throws(() => happyPathAttemptContext({ ...configured, E2E_ATTEMPT_ID: undefined }), /E2E_ATTEMPT_ID/);
  assert.throws(() => happyPathAttemptContext({ ...configured, E2E_ATTEMPT_ROLE: " " }), /E2E_ATTEMPT_ROLE/);
  assert.throws(() => happyPathAttemptContext({ ...configured, E2E_ATTEMPT_SLOT: " " }), /E2E_ATTEMPT_SLOT/);
  assert.throws(() => happyPathAttemptContext({ ...configured, MODERATION_E2E_OWNER_EMAIL: "owner@example.invalid" }), /stripped/);
  assert.throws(() => happyPathAttemptContext({ ...configured, E2E_STAGING_PAIR_ID: "api:not-the-manifest|solid:not-the-manifest" }), /does not match/);
  assert.throws(() => happyPathAttemptContext({ ...configured, E2E_STAGING_MANIFEST_SHA256: "0".repeat(64) }), /SHA-256/);
});

test("rejects a digest-valid manifest whose recorded playback is disabled", () => {
  const disabled = manifest.replace('"SONG_PLAYBACK_ENABLED": "true"', '"SONG_PLAYBACK_ENABLED": "false"');
  const disabledPath = join(mkdtempSync(join(tmpdir(), "happy-path-disabled-")), "staging-serving-pair.json");
  writeFileSync(disabledPath, disabled);
  const disabledDigest = createHash("sha256").update(disabled).digest("hex");
  assert.throws(() => happyPathAttemptContext({
    ...configured,
    E2E_STAGING_MANIFEST_PATH: disabledPath,
    E2E_STAGING_MANIFEST_SHA256: disabledDigest,
    E2E_STAGING_PAIR_ID: pair,
  }), /SONG_PLAYBACK_ENABLED/);
});

test("keeps D0 observed-pair preflight independent from the later playback gate", () => {
  const disabled = manifest.replace('"SONG_PLAYBACK_ENABLED": "true"', '"SONG_PLAYBACK_ENABLED": "false"');
  const disabledPath = join(mkdtempSync(join(tmpdir(), "happy-path-d0-")), "staging-serving-pair.json");
  writeFileSync(disabledPath, disabled);
  const disabledDigest = createHash("sha256").update(disabled).digest("hex");
  const evidence = stagingPairEvidence({
    ...configured,
    E2E_STAGING_MANIFEST_PATH: disabledPath,
    E2E_STAGING_MANIFEST_SHA256: disabledDigest,
    E2E_STAGING_PAIR_ID: pair,
  });
  assert.equal(evidence.playbackHost, null);
});

test("does not require a duplicated pair environment value when the manifest is bound", () => {
  const withoutPair = { ...configured, E2E_STAGING_PAIR_ID: undefined };
  assert.equal(happyPathAttemptContext(withoutPair).manifestDigest, manifestDigest);
});

test("accepts a later attempt with an independently selected identity slot", () => {
  const later = happyPathAttemptContext({
    ...configured,
    E2E_ATTEMPT_ID: "m1-a3-01234567-89ab-cdef-0123-456789abcdef",
    E2E_ATTEMPT_NUMBER: "3",
    E2E_ATTEMPT_ROLE: "member",
    E2E_ATTEMPT_SLOT: "viewer",
  });
  assert.equal(later.number, "3");
  assert.equal(later.identitySlot, "viewer");
});
