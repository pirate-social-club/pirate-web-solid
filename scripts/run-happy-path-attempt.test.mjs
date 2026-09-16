import assert from "node:assert/strict";
import test from "node:test";
import { buildAttemptEnvironment, parseInvocation, selectAttemptCredentials } from "./run-happy-path-attempt.mjs";

const configured = {
  MODERATION_E2E_OWNER_EMAIL: " owner@example.invalid ",
  MODERATION_E2E_OWNER_OTP: "123456",
  MODERATION_E2E_MEMBER_EMAIL: "member@example.invalid",
  MODERATION_E2E_MEMBER_OTP: "654321",
  MODERATION_E2E_VIEWER_EMAIL: "viewer@example.invalid",
  MODERATION_E2E_VIEWER_OTP: "112233",
  E2E_PRIVY_EMAIL: "old@example.invalid",
  E2E_PRIVY_OTP: "000000",
  E2E_BASE_URL: "https://web-next-staging.pirate.sc",
  E2E_STAGING_PAIR_ID: "api:api-version;solid:solid-version",
  MODERATION_UNRELATED_SECRET: "must-not-reach-child",
  INFISICAL_TOKEN: "must-not-reach-child",
};

test("parses the documented space-separated invocation", () => {
  assert.deepEqual(parseInvocation(["--attempt", "3", "--slot", "viewer", "--role", "owner"]), {
    attempt: "3",
    slot: "viewer",
    role: "owner",
  });
});

test("parses equals-separated options without coupling identity to attempt number", () => {
  assert.deepEqual(parseInvocation(["--attempt=3", "--slot=viewer", "--role=owner"]), {
    attempt: "3",
    slot: "viewer",
    role: "owner",
  });
});

test("rejects unknown, duplicate, missing-value and positional invocation arguments", () => {
  assert.throws(() => parseInvocation(["--attempt", "3", "--identity", "viewer", "--role", "owner"]), /does not recognize option --identity/);
  assert.throws(() => parseInvocation(["--attempt", "3", "--attempt=4", "--slot", "viewer", "--role", "owner"]), /duplicate --attempt/);
  assert.throws(() => parseInvocation(["--attempt", "3", "--slot", "--role", "owner"]), /requires a value for --slot/);
  assert.throws(() => parseInvocation(["--attempt=", "--slot=viewer", "--role=owner"]), /non-empty value for --attempt/);
  assert.throws(() => parseInvocation(["3", "--slot", "viewer", "--role", "owner"]), /rejects positional arguments/);
  assert.throws(() => parseInvocation(["--attempt", "3", "--slot", "viewer", "--role", "owner", "garbage"]), /rejects positional arguments/);
});

test("selects any explicitly named credential slot without coupling it to the attempt number", () => {
  assert.deepEqual(selectAttemptCredentials(configured, "owner"), {
    identitySlot: "owner",
    selected: { email: "owner@example.invalid", otp: "123456" },
  });
  assert.deepEqual(selectAttemptCredentials(configured, "VIEWER"), {
    identitySlot: "viewer",
    selected: { email: "viewer@example.invalid", otp: "112233" },
  });
  assert.throws(() => selectAttemptCredentials({ ...configured, MODERATION_E2E_VIEWER_OTP: "12345" }, "viewer"), /six-digit/);
  assert.throws(() => selectAttemptCredentials(configured, "viewer@example"), /identity slot/);
});

test("builds a child environment with only direct selected credentials and safe attempt context", () => {
  const result = buildAttemptEnvironment(configured, {
    attempt: 3,
    slot: "viewer",
    role: "member",
  }, "01234567-89ab-cdef-0123-456789abcdef");
  assert.equal(result.id, "m1-a3-01234567-89ab-cdef-0123-456789abcdef");
  assert.equal(result.number, "3");
  assert.equal(result.role, "member");
  assert.equal(result.identitySlot, "viewer");
  assert.equal(result.env.E2E_PRIVY_EMAIL, "viewer@example.invalid");
  assert.equal(result.env.E2E_PRIVY_OTP, "112233");
  assert.equal(result.env.E2E_ALLOW_MUTATION, "1");
  assert.equal(result.env.E2E_FRESH_PRIVY_ACCOUNT, "1");
  assert.equal(result.env.E2E_ATTEMPT_ROLE, "member");
  assert.match(result.env.E2E_ATTEMPT_STARTED_AT, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(result.env.E2E_ATTEMPT_NUMBER, "3");
  assert.equal(result.env.E2E_ATTEMPT_SLOT, "viewer");
  assert.equal(result.env.MODERATION_E2E_OWNER_EMAIL, undefined);
  assert.equal(result.env.MODERATION_E2E_OWNER_OTP, undefined);
  assert.equal(result.env.MODERATION_E2E_MEMBER_EMAIL, undefined);
  assert.equal(result.env.MODERATION_E2E_MEMBER_OTP, undefined);
  assert.equal(result.env.MODERATION_E2E_VIEWER_EMAIL, undefined);
  assert.equal(result.env.MODERATION_E2E_VIEWER_OTP, undefined);
  assert.equal(result.env.MODERATION_UNRELATED_SECRET, undefined);
  assert.equal(result.env.INFISICAL_TOKEN, undefined);
  assert.equal(result.env.E2E_BASE_URL, configured.E2E_BASE_URL);
  assert.equal(result.env.E2E_STAGING_PAIR_ID, configured.E2E_STAGING_PAIR_ID);
});
