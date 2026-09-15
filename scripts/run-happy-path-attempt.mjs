import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const PASSTHROUGH_KEYS = new Set([
  "BUN_INSTALL",
  "BUN_INSTALL_BIN",
  "CI",
  "COLORTERM",
  "E2E_BASE_URL",
  "E2E_STAGING_MANIFEST_PATH",
  "E2E_STAGING_MANIFEST_SHA256",
  "E2E_STAGING_PAIR_ID",
  "E2E_STAGING_PAIR_OBSERVED",
  "FORCE_COLOR",
  "HOME",
  "LANG",
  "LC_ALL",
  "NODE_OPTIONS",
  "NO_COLOR",
  "PATH",
  "PLAYWRIGHT_BROWSERS_PATH",
  "TERM",
  "TEMP",
  "TMP",
  "TMPDIR",
  "TZ",
]);

const ATTEMPTS = Object.freeze({
  "1": Object.freeze({ role: "owner", email: "MODERATION_E2E_OWNER_EMAIL", otp: "MODERATION_E2E_OWNER_OTP" }),
  "2": Object.freeze({ role: "member", email: "MODERATION_E2E_MEMBER_EMAIL", otp: "MODERATION_E2E_MEMBER_OTP" }),
});

function normalized(value) {
  return typeof value === "string" ? value.trim() : "";
}

function credentialsFor(env, attempt, descriptor) {
  const email = normalized(env[descriptor.email]);
  const otp = normalized(env[descriptor.otp]);
  if (!email || !otp || !/^\d{6}$/u.test(otp)) {
    throw new Error(`Attempt ${attempt} requires an operator-selected email and six-digit OTP.`);
  }
  return Object.freeze({ email, otp });
}

export function selectAttemptCredentials(env, attempt) {
  const key = String(attempt);
  const descriptor = ATTEMPTS[key];
  if (!descriptor) throw new Error("Happy-path attempt must be 1 (owner) or 2 (member).");

  const owner = credentialsFor(env, "1", ATTEMPTS["1"]);
  const member = credentialsFor(env, "2", ATTEMPTS["2"]);
  if (owner.email.toLowerCase() === member.email.toLowerCase()) {
    throw new Error("Owner and member attempts must use distinct email identities.");
  }
  const selected = descriptor.role === "owner" ? owner : member;
  return Object.freeze({ selected: Object.freeze({ ...selected }), role: descriptor.role });
}

function generatedAttemptId(attempt, uuid = randomUUID()) {
  const id = `m1-a${attempt}-${uuid}`;
  if (!/^m1-a[12]-[0-9a-f-]{20,}$/u.test(id)) throw new Error("Could not create a safe unique attempt identifier.");
  return id;
}

export function buildAttemptEnvironment(env, attempt, uuid = randomUUID()) {
  const key = String(attempt);
  const selected = selectAttemptCredentials(env, key);
  const child = Object.fromEntries(Object.entries(env).filter(([name]) => PASSTHROUGH_KEYS.has(name)));
  const id = generatedAttemptId(key, uuid);
  const startedAt = new Date().toISOString();
  child.E2E_PRIVY_EMAIL = selected.selected.email;
  child.E2E_PRIVY_OTP = selected.selected.otp;
  child.E2E_ALLOW_MUTATION = "1";
  child.E2E_FRESH_PRIVY_ACCOUNT = "1";
  child.E2E_ATTEMPT_ID = id;
  child.E2E_ATTEMPT_NUMBER = key;
  child.E2E_ATTEMPT_ROLE = selected.role;
  child.E2E_ATTEMPT_STARTED_AT = startedAt;
  return Object.freeze({ env: Object.freeze(child), id, number: key, role: selected.role, startedAt });
}

export function runAttempt({ env = process.env, attempt = process.argv[2] } = {}) {
  const context = buildAttemptEnvironment(env, attempt);
  const result = spawnSync("bun", ["run", "test:e2e:happy-path"], {
    env: context.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = runAttempt();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Happy-path attempt could not start."}\n`);
    process.exitCode = 1;
  }
}
