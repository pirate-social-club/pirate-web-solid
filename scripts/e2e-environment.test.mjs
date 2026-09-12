import { test } from "node:test";
import assert from "node:assert/strict";
import { e2eAuthCredentials, e2eBaseURL, hasE2eAuthCredentials, requireMutationEnvironment } from "../e2e/fixtures/environment.ts";

const configured = { E2E_ALLOW_MUTATION: "1", E2E_PRIVY_EMAIL: "operator@example.invalid", E2E_PRIVY_OTP: "123456" };

test("required acceptance refuses absent consent or credentials, including malformed OTP", () => {
  assert.throws(() => requireMutationEnvironment({}), /E2E_ALLOW_MUTATION=1/);
  assert.throws(() => requireMutationEnvironment({ ...configured, E2E_ALLOW_MUTATION: "true" }), /E2E_ALLOW_MUTATION=1/);
  for (const input of [{ E2E_ALLOW_MUTATION: "1" }, { ...configured, E2E_PRIVY_EMAIL: " " }, { ...configured, E2E_PRIVY_OTP: "12345" }]) {
    assert.throws(() => requireMutationEnvironment(input), /six-digit fixed OTP/);
    assert.equal(hasE2eAuthCredentials(input), false);
  }
});

test("required acceptance accepts only staging or prepared loopback origins", () => {
  for (const target of [e2eBaseURL({}), "http://localhost:3000", "http://127.0.0.1:3000/", "https://[::1]:8443"]) {
    assert.doesNotThrow(() => requireMutationEnvironment({ ...configured, E2E_BASE_URL: target }));
  }
  for (const target of ["https://pirate.sc", "https://web-next-staging.pirate.sc.evil.invalid", "http://web-next-staging.pirate.sc", "https://web-next-staging.pirate.sc:444", "ftp://localhost", "http://localhost/path", "http://localhost?token=private", "http://localhost/#private", "http://private:secret@localhost", "private malformed target"]) {
    assert.throws(() => requireMutationEnvironment({ ...configured, E2E_BASE_URL: target }), error => {
      assert.match(error.message, /refused/);
      assert.equal(error.message.includes("private"), false);
      assert.equal(error.message.includes("secret@"), false);
      return true;
    });
  }
});

test("auth and preflight share trimmed credentials and operator fallback", () => {
  const fallback = { E2E_ALLOW_MUTATION: "1", MODERATION_E2E_OWNER_EMAIL: " operator@example.invalid ", MODERATION_E2E_OWNER_OTP: " 123456 " };
  assert.deepEqual(e2eAuthCredentials(fallback), { email: "operator@example.invalid", otp: "123456" });
  assert.equal(hasE2eAuthCredentials(fallback), true);
  assert.doesNotThrow(() => requireMutationEnvironment(fallback));
  assert.deepEqual(e2eAuthCredentials({ ...fallback, E2E_PRIVY_EMAIL: "direct@example.invalid", E2E_PRIVY_OTP: "654321" }), { email: "direct@example.invalid", otp: "654321" });
});
