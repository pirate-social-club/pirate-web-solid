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
  return stagingPairEvidence(env);
}

export function requireHappyPathPlaybackEnvironment(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  requireHappyPathObservedEnvironment(env);
  if (env.E2E_SONG_PLAYBACK_READY !== "1") {
    throw new Error("M1 song acceptance requires E2E_SONG_PLAYBACK_READY=1 after playback infrastructure is observed.");
  }
}

export function stagingPairEvidence(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  if (env.E2E_STAGING_PAIR_OBSERVED !== "1") {
    throw new Error("M1 requires E2E_STAGING_PAIR_OBSERVED=1 after Lane A records the serving pair readback.");
  }
  const pair = env.E2E_STAGING_PAIR_ID?.trim();
  if (!pair) {
    throw new Error("M1 requires E2E_STAGING_PAIR_ID with the concrete observed API/Solid pair identifiers.");
  }
  if (pair.length > 256 || /[\r\n]/u.test(pair)) {
    throw new Error("E2E_STAGING_PAIR_ID must be a short single-line serving-pair identifier.");
  }
  return pair;
}
