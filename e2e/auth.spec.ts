import { readonlyApi } from "./fixtures/api.ts";
import { expect, hasE2eAuthCredentials, test } from "./fixtures/auth.ts";

test.describe("staging Privy session", { tag: "@staging-readonly" }, () => {
  test.skip(
    !hasE2eAuthCredentials(),
    "Set E2E_PRIVY_EMAIL and E2E_PRIVY_OTP to exercise staging authentication",
  );

  test("persists the same-origin authenticated shell", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-home-session='authenticated']")).toBeVisible();
    await expect(page.locator("[data-media-shell][data-shell-auth='authenticated']")).toBeVisible();

    const user = await readonlyApi(page).currentUser();
    expect(user.object).toBe("user");
    expect(typeof user.id).toBe("string");
    expect(String(user.id)).not.toHaveLength(0);
  });
});
