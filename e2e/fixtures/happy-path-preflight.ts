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
