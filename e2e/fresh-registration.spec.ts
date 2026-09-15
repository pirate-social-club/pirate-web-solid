import { expect, test } from "playwright/test";

import {
  registerFreshAccount,
  signInExistingAccount,
} from "./fixtures/fresh-registration.ts";
import {
  requireHappyPathObservedEnvironment,
  stagingPairEvidence,
} from "./fixtures/happy-path-preflight.ts";

test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("M1 D0 fresh registration", { tag: "@happy-path" }, () => {
  test.setTimeout(240_000);

  test.beforeAll(() => requireHappyPathObservedEnvironment());

  test("registers, survives reload, and re-signs in in a new browser context", async ({ browser }, testInfo) => {
    testInfo.annotations.push({ type: "staging-serving-pair", description: stagingPairEvidence() });
    const first = await registerFreshAccount(browser);
    expect(first.exchangeStatuses).toEqual([401, 200]);
    expect(first.registerStatuses).toEqual([201]);
    expect(first.registrationAttestationValid).toBe(true);

    const second = await signInExistingAccount(browser);
    expect(second.exchangeStatuses).toEqual([200]);
    expect(second.registerStatuses).toEqual([]);
  });
});
