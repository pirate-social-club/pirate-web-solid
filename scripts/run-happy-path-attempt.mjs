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

const SLOT_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,31}$/u;
const ATTEMPT_PATTERN = /^[1-9]\d{0,5}$/u;
const ROLE_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/u;

function normalized(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedSlot(value) {
  const slot = normalized(value);
  if (!SLOT_PATTERN.test(slot)) {
    throw new Error("M1 requires an identity slot using letters, digits and underscores.");
  }
  return slot.toLowerCase();
}

function normalizedAttempt(value) {
  const attempt = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : normalized(value);
  if (!ATTEMPT_PATTERN.test(attempt)) {
    throw new Error("M1 requires a positive numeric attempt number.");
  }
  return String(Number(attempt));
}

function normalizedRole(value) {
  const role = normalized(value).toLowerCase();
  if (!ROLE_PATTERN.test(role)) {
    throw new Error("M1 requires an explicit identity role using lowercase letters, digits, hyphens or underscores.");
  }
  return role;
}

function credentialsFor(env, slot) {
  const prefix = `MODERATION_E2E_${slot.toUpperCase()}`;
  const email = normalized(env[`${prefix}_EMAIL`]);
  const otp = normalized(env[`${prefix}_OTP`]);
  if (!email || !otp || !/^\d{6}$/u.test(otp)) {
    throw new Error(`M1 identity slot ${slot} requires an operator-selected email and six-digit OTP.`);
  }
  return Object.freeze({ email, otp });
}

export function selectAttemptCredentials(env, slot) {
  const identitySlot = normalizedSlot(slot);
  return Object.freeze({
    identitySlot,
    selected: Object.freeze({ ...credentialsFor(env, identitySlot) }),
  });
}

function generatedAttemptId(attempt, uuid = randomUUID()) {
  const id = `m1-a${attempt}-${uuid}`;
  if (!/^m1-a[1-9]\d{0,5}-[0-9a-f-]{20,}$/u.test(id)) throw new Error("Could not create a safe unique attempt identifier.");
  return id;
}

export function buildAttemptEnvironment(env, { attempt, slot, role }, uuid = randomUUID()) {
  const number = normalizedAttempt(attempt);
  const identityRole = normalizedRole(role);
  const selected = selectAttemptCredentials(env, slot);
  const child = Object.fromEntries(Object.entries(env).filter(([name]) => PASSTHROUGH_KEYS.has(name)));
  const id = generatedAttemptId(number, uuid);
  const startedAt = new Date().toISOString();
  child.E2E_PRIVY_EMAIL = selected.selected.email;
  child.E2E_PRIVY_OTP = selected.selected.otp;
  child.E2E_ALLOW_MUTATION = "1";
  child.E2E_FRESH_PRIVY_ACCOUNT = "1";
  child.E2E_ATTEMPT_ID = id;
  child.E2E_ATTEMPT_NUMBER = number;
  child.E2E_ATTEMPT_ROLE = identityRole;
  child.E2E_ATTEMPT_SLOT = selected.identitySlot;
  child.E2E_ATTEMPT_STARTED_AT = startedAt;
  return Object.freeze({ env: Object.freeze(child), id, number, role: identityRole, identitySlot: selected.identitySlot, startedAt });
}

function option(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find(value => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseInvocation(args) {
  if (args.some(value => !value.startsWith("--"))) {
    throw new Error("M1 attempt requires --attempt, --slot and --role options.");
  }
  const values = {
    attempt: option(args, "attempt"),
    slot: option(args, "slot"),
    role: option(args, "role"),
  };
  if (!values.attempt || !values.slot || !values.role) {
    throw new Error("M1 attempt requires --attempt, --slot and --role options.");
  }
  return values;
}

export function runAttempt({ env = process.env, attempt, slot, role, args = process.argv.slice(2) } = {}) {
  const invocation = attempt === undefined || slot === undefined || role === undefined
    ? parseInvocation(args)
    : { attempt, slot, role };
  const context = buildAttemptEnvironment(env, invocation);
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
