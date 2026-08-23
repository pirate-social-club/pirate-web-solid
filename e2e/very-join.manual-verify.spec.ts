import { readonlyApi } from "./fixtures/api.ts";
import { expect, hasE2eAuthCredentials, test } from "./fixtures/auth.ts";

const allowManualVerify = process.env.E2E_ALLOW_MANUAL_VERIFY === "1";
const communityId = process.env.E2E_VERY_FIXTURE_COMMUNITY_ID?.trim()
  || "community-very-staging-fixture-acceptance-v1";

test.describe("Very join manual completion evidence", { tag: "@staging-manual" }, () => {
  test.skip(
    !allowManualVerify,
    "Set E2E_ALLOW_MANUAL_VERIFY=1 only after the release palm scan has completed",
  );
  test.skip(!hasE2eAuthCredentials(), "Set E2E_PRIVY_EMAIL and E2E_PRIVY_OTP for staging authentication");

  test("reads the completed membership without issuing a write", async ({ page }) => {
    const eligibility = await readonlyApi(page).joinEligibility(communityId);
    expect(eligibility.community).toBe(communityId);
    expect(eligibility.status).toBe("already_joined");
    expect(eligibility.next_action).toEqual({ kind: "none", reason: "already_joined" });
  });
});
