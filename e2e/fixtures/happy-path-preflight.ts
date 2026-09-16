import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  e2eAuthCredentials,
  e2eBaseURL,
  requireMutationEnvironment,
} from "./environment.ts";

/**
 * M1 consumes one identity that must be new to Pirate for each run. The
 * product has no suite-owned account teardown, so accepting the ordinary
 * reusable E2E identity here would turn D0 into a sign-in test.
 */
export function requireHappyPathEnvironment(env: Readonly<Record<string, string | undefined>> = process.env): void {
  requireMutationEnvironment(env);
  if (env.E2E_FRESH_PRIVY_ACCOUNT !== "1") {
    throw new Error("M1 requires E2E_FRESH_PRIVY_ACCOUNT=1 with a never-registered Privy staging identity.");
  }
  if (!env.E2E_PRIVY_EMAIL?.trim() || !env.E2E_PRIVY_OTP?.trim()) {
    throw new Error("M1 requires direct E2E_PRIVY_EMAIL and E2E_PRIVY_OTP values for the fresh identity.");
  }
  // Keep the target validation in one place while retaining the explicit
  // direct-credential requirement above.
  new URL(e2eBaseURL(env));
  e2eAuthCredentials(env);
}

export function requireHappyPathObservedEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  requireHappyPathEnvironment(env);
  return stagingPairEvidence(env).releaseReference;
}

export type HappyPathAttemptContext = Readonly<{
  readonly id: string;
  readonly number: string;
  readonly role: string;
  readonly identitySlot: string;
  readonly startedAt: string;
  readonly releaseReference: string;
  readonly manifestDigest: string;
  readonly manifestObservedAt: string;
  readonly playbackHost: string;
}>;

export function happyPathAttemptContext(
  env: Readonly<Record<string, string | undefined>> = process.env,
): HappyPathAttemptContext {
  requireHappyPathEnvironment(env);
  const number = env.E2E_ATTEMPT_NUMBER;
  const role = env.E2E_ATTEMPT_ROLE;
  const identitySlot = env.E2E_ATTEMPT_SLOT?.trim().toLowerCase();
  const id = env.E2E_ATTEMPT_ID?.trim();
  const startedAt = env.E2E_ATTEMPT_STARTED_AT?.trim();
  if (!number || !/^[1-9]\d{0,5}$/u.test(number) || String(Number(number)) !== number) {
    throw new Error("M1 requires a positive numeric E2E_ATTEMPT_NUMBER from the secret-runner command.");
  }
  if (!role || !/^[a-z][a-z0-9_-]{0,31}$/u.test(role)) {
    throw new Error("M1 requires an explicit safe E2E_ATTEMPT_ROLE from the secret-runner command.");
  }
  if (!identitySlot || !/^[a-z][a-z0-9_]{0,31}$/u.test(identitySlot)) {
    throw new Error("M1 requires a safe E2E_ATTEMPT_SLOT from the secret-runner command.");
  }
  if (!id || !/^m1-a[1-9]\d{0,5}-[0-9a-f-]{20,}$/u.test(id) || id.length > 128) {
    throw new Error("M1 requires a safe unique E2E_ATTEMPT_ID from the secret-runner command.");
  }
  if (!startedAt || !/^\d{4}-\d{2}-\d{2}T[^\r\n]+Z$/u.test(startedAt) || Number.isNaN(Date.parse(startedAt))) {
    throw new Error("M1 requires E2E_ATTEMPT_STARTED_AT from the secret-runner command.");
  }
  for (const name of Object.keys(env)) {
    if (/^MODERATION_E2E_[A-Z][A-Z0-9_]{0,31}_(?:EMAIL|OTP)$/u.test(name) && env[name] !== undefined) {
      throw new Error("M1 requires operator credential variables to be stripped before Playwright starts.");
    }
  }
  const manifest = stagingPairEvidence(env, true);
  if (manifest.playbackHost === null) throw new Error("M1 observed staging manifest has no playback origin readback.");
  return {
    id,
    number,
    role,
    identitySlot,
    startedAt,
    releaseReference: manifest.releaseReference,
    manifestDigest: manifest.digest,
    manifestObservedAt: manifest.observedAt,
    playbackHost: manifest.playbackHost,
  };
}

export function stagingPairEvidence(
  env: Readonly<Record<string, string | undefined>> = process.env,
  requirePlayback = false,
): Readonly<{ readonly releaseReference: string; readonly digest: string; readonly observedAt: string; readonly playbackHost: string | null }> {
  if (env.E2E_STAGING_PAIR_OBSERVED !== "1") {
    throw new Error("M1 requires E2E_STAGING_PAIR_OBSERVED=1 as operator consent to use the serving-pair readback.");
  }
  const manifestPath = env.E2E_STAGING_MANIFEST_PATH?.trim();
  const expectedDigest = env.E2E_STAGING_MANIFEST_SHA256?.trim().toLowerCase();
  if (!manifestPath || !expectedDigest || !/^[a-f0-9]{64}$/u.test(expectedDigest)) {
    throw new Error("M1 requires an observed staging manifest path and exact SHA-256 reference.");
  }
  let bytes: Buffer;
  let observed: Record<string, unknown>;
  try {
    bytes = readFileSync(manifestPath);
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (parsed === null || typeof parsed !== "object" || !("observed" in parsed)) throw new Error("missing observed block");
    const candidate = parsed.observed;
    if (candidate === null || typeof candidate !== "object") throw new Error("missing observed block");
    observed = candidate as Record<string, unknown>;
  } catch {
    throw new Error("M1 could not read the observed staging manifest.");
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== expectedDigest) throw new Error("M1 staging manifest SHA-256 does not match the supplied reference.");
  const pair = typeof observed.pair_id === "string" ? observed.pair_id.trim() : "";
  const observedAt = typeof observed.at === "string" ? observed.at.trim() : "";
  const playbackHost = validateObservedServingPair(observed, pair, requirePlayback);
  if (!observedAt || Number.isNaN(Date.parse(observedAt))) throw new Error("M1 observed staging manifest has no valid observation time.");
  if (env.E2E_STAGING_PAIR_ID?.trim() && env.E2E_STAGING_PAIR_ID.trim() !== pair) {
    throw new Error("M1 supplied release does not match the observed staging manifest.");
  }
  return { releaseReference: `manifest-sha256:${digest}`, digest, observedAt, playbackHost };
}

type JsonRecord = Record<string, unknown>;

const EXPECTED_WORKERS = Object.freeze([
  ["api:http", "http"],
  ["api:data-registration", "data_registration"],
  ["api:media-processor", "media_processor"],
  ["api:jobs", "jobs"],
] as const);

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requireText(value: unknown, message: string): string {
  const result = text(value);
  if (!result) throw new Error(message);
  return result;
}

function requireTraffic(value: unknown, component: string): void {
  if (value !== 100) throw new Error(`M1 observed ${component} does not have 100% traffic.`);
}

function requireHealth(value: unknown, component: string): void {
  const health = record(value);
  if (!health) throw new Error(`M1 observed ${component} has no health readback.`);
  if (health.status !== 200) throw new Error(`M1 observed ${component} health is not HTTP 200.`);
}

function requireOptionalPublicHealth(value: unknown, component: string): void {
  if (value === undefined) return;
  const health = record(value);
  if (!health) throw new Error(`M1 observed ${component} has invalid public health readback.`);
  if (health.status !== "not_applicable" && health.status !== 200) {
    throw new Error(`M1 observed ${component} public health is not healthy.`);
  }
}

function parsePair(pair: string): ReadonlyMap<string, Readonly<{ source: string; version: string }>> {
  if (!pair || pair.length > 1024 || !/^[A-Za-z0-9._:;=@|+/-]+$/u.test(pair)) {
    throw new Error("M1 observed staging manifest has no valid serving pair.");
  }
  const entries = new Map<string, { source: string; version: string }>();
  for (const part of pair.split("|")) {
    const separator = part.indexOf(":", 4);
    const at = part.indexOf("@");
    if (separator < 0 || at < separator || at === part.length - 1) {
      throw new Error("M1 observed staging manifest has malformed serving-pair components.");
    }
    const component = part.slice(0, separator);
    const source = part.slice(separator + 1, at);
    const version = part.slice(at + 1);
    const namespace = component.split(":", 1)[0] ?? "";
    if ((namespace !== "api" && namespace !== "solid")
      || !/^[a-f0-9]{7,64}$/u.test(source)
      || !/^[A-Za-z0-9-]{8,128}$/u.test(version)
      || entries.has(component)) {
      throw new Error("M1 observed staging manifest has malformed serving-pair components.");
    }
    entries.set(component, { source, version });
  }
  return entries;
}

function validateObservedServingPair(observed: JsonRecord, pair: string, requirePlayback: boolean): string | null {
  const pairEntries = parsePair(pair);
  const api = record(observed.api);
  const solid = record(observed.solid);
  if (!api || !solid) throw new Error("M1 observed staging manifest has no API/Solid deployment readback.");
  const apiSource = requireText(api.source_commit, "M1 observed staging manifest has no API source commit.");
  const solidSource = requireText(solid.source_commit, "M1 observed staging manifest has no Solid source commit.");
  const workers = record(api.workers);
  if (!workers) throw new Error("M1 observed staging manifest has no API worker readback.");
  let playbackHost: string | null = null;

  const expectedPairKeys = new Set([...EXPECTED_WORKERS.map(([key]) => key), "solid"]);
  if (pairEntries.size !== expectedPairKeys.size || [...expectedPairKeys].some(key => !pairEntries.has(key))) {
    throw new Error("M1 observed staging manifest does not contain the five expected serving components.");
  }

  for (const [pairKey, workerKey] of EXPECTED_WORKERS) {
    const worker = record(workers[workerKey]);
    if (!worker) throw new Error(`M1 observed staging manifest has no ${workerKey} worker readback.`);
    const source = requireText(worker.source_commit, `M1 observed ${workerKey} has no source commit.`);
    const version = requireText(worker.version_id, `M1 observed ${workerKey} has no version id.`);
    requireTraffic(worker.traffic_percent, workerKey);
    const pairEntry = pairEntries.get(pairKey)!;
    if (source !== apiSource || pairEntry.source !== source || pairEntry.version !== version) {
      throw new Error(`M1 observed ${workerKey} is not coherent with the serving pair.`);
    }
    requireOptionalPublicHealth(worker.public_health, workerKey);
    if (workerKey === "http") {
      requireHealth(worker.health, workerKey);
      if (!requirePlayback) continue;
      const flags = record(worker.deployed_flags);
      if (!flags || (flags.SONG_PLAYBACK_ENABLED !== "true" && flags.SONG_PLAYBACK_ENABLED !== true)) {
        throw new Error("M1 observed HTTP worker does not have SONG_PLAYBACK_ENABLED=true.");
      }
      const account = text(flags.SONG_PLAYBACK_R2_ACCOUNT_ID);
      const bucket = text(flags.SONG_PLAYBACK_R2_BUCKET);
      if (!account || !bucket || account.toLowerCase() === "redacted" || bucket.toLowerCase() === "redacted"
        || !/^[A-Za-z0-9-]+$/u.test(account) || !/^[A-Za-z0-9._-]+$/u.test(bucket)) {
        throw new Error("M1 observed HTTP worker has no non-empty song playback R2 account and bucket.");
      }
      // The derived host is the only playback origin accepted by the M1 audio assertion.
      playbackHost = `${account.toLowerCase()}.r2.cloudflarestorage.com`;
    }
  }

  const solidHealth = record(solid.health);
  if (!solidHealth || Object.keys(solidHealth).length === 0) throw new Error("M1 observed Solid deployment has no health readback.");
  for (const [path, value] of Object.entries(solidHealth)) {
    const route = record(value);
    if (!route || route.status !== 200) throw new Error(`M1 observed Solid health route ${path} is not HTTP 200.`);
  }
  requireTraffic(solid.traffic_percent, "solid");
  const solidPair = pairEntries.get("solid")!;
  if (solidPair.source !== solidSource || solidPair.version !== requireText(solid.version_id, "M1 observed Solid has no version id.")) {
    throw new Error("M1 observed Solid deployment is not coherent with the serving pair.");
  }
  if (requirePlayback && playbackHost === null) throw new Error("M1 observed HTTP worker has no playback origin readback.");
  return playbackHost;
}
