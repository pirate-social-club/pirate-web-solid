import { test } from "node:test";
import assert from "node:assert/strict";
import { completePrivyEmail } from "../e2e/fixtures/auth.ts";

function setCredentials(t) {
  for (const [key, value] of Object.entries({ E2E_PRIVY_EMAIL: "operator@example.invalid", E2E_PRIVY_OTP: "123456" })) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}

test("sign-in enters email before requesting the code, then fills InputOTP and verifies", async t => {
  setCredentials(t);
  const calls = [];
  const page = { getByRole(role, options) {
    assert.equal(options.exact, true);
    return {
      fill: async value => calls.push([role, options.name, "fill", value]),
      click: async () => calls.push([role, options.name, "click"]),
    };
  } };
  await completePrivyEmail(page);
  assert.deepEqual(calls, [
    ["textbox", "Email", "fill", "operator@example.invalid"],
    ["button", "Continue with email", "click"],
    ...[..."123456"].map((digit, index) => ["textbox", `Verification code digit ${index + 1} of 6`, "fill", digit]),
    ["button", "Verify and continue", "click"],
  ]);
});

test("sign-in failures describe the stage without repeating credential-bearing locator errors", async t => {
  setCredentials(t);
  const page = { getByRole() { return { fill: async () => { throw new Error("operator@example.invalid 123456 private raw DOM"); } }; } };
  await assert.rejects(() => completePrivyEmail(page), error => {
    assert.match(error.message, /email entry/);
    for (const secret of ["operator@example.invalid", "123456", "raw DOM"]) assert.equal(error.message.includes(secret), false);
    return true;
  });
});
