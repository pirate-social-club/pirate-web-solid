import assert from "node:assert/strict";
import test from "node:test";
import { buildAttemptEnvironment, selectAttemptCredentials } from "./run-happy-path-attempt.mjs";

const configured = {
  MODERATION_E2E_OWNER_EMAIL: " owner@example.invalid ",
  MODERATION_E2E_OWNER_OTP: "123456",
  MODERATION_E2E_MEMBER_EMAIL: "member@example.invalid",
  MODERATION_E2E_MEMBER_OTP: "654321",
  E2E_PRIVY_EMAIL: "old@example.invalid",
  E2E_PRIVY_OTP: "000000",
  E2E_BASE_URL: "https://web-next-staging.pirate.sc",
  E2E_STAGING_PAIR_ID: "api:api-version;solid:solid-version",
  MODERATION_UNRELATED_SECRET: "must-not-reach-child",
  INFISICAL_TOKEN: "must-not-reach-child",
};

test("selects owner and member credentials only in memory and enforces identity separation", () => {
  assert.deepEqual(selectAttemptCredentials(configured, 1).selected, { email: "owner@example.invalid", otp: "123456" });
  assert.deepEqual(selectAttemptCredentials(configured, 2).selected, { email: "member@example.invalid", otp: "654321" });
  assert.throws(() => selectAttemptCredentials({ ...configured, MODERATION_E2E_MEMBER_EMAIL: "owner@example.invalid" }, 1), /distinct email/);
  assert.throws(() => selectAttemptCredentials({ ...configured, MODERATION_E2E_MEMBER_OTP: "12345" }, 2), /six-digit/);
});

test("builds a child environment with only direct selected credentials and safe attempt context", () => {
  const result = buildAttemptEnvironment(configured, 2, "01234567-89ab-cdef-0123-456789abcdef");
  assert.equal(result.id, "m1-a2-01234567-89ab-cdef-0123-456789abcdef");
  assert.equal(result.number, "2");
  assert.equal(result.role, "member");
  assert.equal(result.env.E2E_PRIVY_EMAIL, "member@example.invalid");
  assert.equal(result.env.E2E_PRIVY_OTP, "654321");
  assert.equal(result.env.E2E_ALLOW_MUTATION, "1");
  assert.equal(result.env.E2E_FRESH_PRIVY_ACCOUNT, "1");
  assert.equal(result.env.E2E_ATTEMPT_ROLE, "member");
  assert.match(result.env.E2E_ATTEMPT_STARTED_AT, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(result.env.MODERATION_E2E_OWNER_EMAIL, undefined);
  assert.equal(result.env.MODERATION_E2E_OWNER_OTP, undefined);
  assert.equal(result.env.MODERATION_E2E_MEMBER_EMAIL, undefined);
  assert.equal(result.env.MODERATION_E2E_MEMBER_OTP, undefined);
  assert.equal(result.env.MODERATION_UNRELATED_SECRET, undefined);
  assert.equal(result.env.INFISICAL_TOKEN, undefined);
  assert.equal(result.env.E2E_BASE_URL, configured.E2E_BASE_URL);
  assert.equal(result.env.E2E_STAGING_PAIR_ID, configured.E2E_STAGING_PAIR_ID);
});
