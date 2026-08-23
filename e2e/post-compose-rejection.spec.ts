import { expect, hasE2eAuthCredentials, test } from "./fixtures/auth.ts";

const allowMutation = process.env.E2E_ALLOW_MUTATION === "1";
const communityId = process.env.E2E_VERY_FIXTURE_COMMUNITY_ID?.trim()
  || "community-very-staging-fixture-acceptance-v1";

test.describe("post rejection without route authority", { tag: "@staging-mutating" }, () => {
  test.skip(!allowMutation, "Set E2E_ALLOW_MUTATION=1 to issue the expected non-writing staging POST");
  test.skip(!hasE2eAuthCredentials(), "Set E2E_PRIVY_EMAIL and E2E_PRIVY_OTP for staging authentication");

  test("turns the fixture 404 into discard-and-edit recovery", async ({ page }) => {
    const body = `E2E route-authority rejection ${Date.now()}`;
    await page.goto("/");
    await page.getByRole("button", { name: "Create post", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create a post" });
    await dialog.getByRole("textbox", { name: "Community ID" }).fill(communityId);
    await dialog.locator("#create-post-body").fill(body);

    const rejected = page.waitForResponse(response =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname === `/api/communities/${communityId}/posts`
    );
    await dialog.getByRole("button", { name: "Publish post" }).click();
    const response = await rejected;
    expect(response.status()).toBe(404);
    const payload = await response.json() as { readonly error?: { readonly code?: unknown; readonly retryable?: unknown } };
    expect(payload.error).toMatchObject({ code: "not_found", retryable: false });

    const rejection = dialog.locator("[data-post-composer-state='reconciling'][role='alert']");
    await expect(rejection).toContainText("The server rejected this saved request (404)");
    await expect(rejection.getByRole("button", { name: "Discard and edit" })).toBeVisible();
    await expect(rejection.getByRole("button", { name: "Check again" })).toHaveCount(0);
    await expect(rejection.getByRole("button", { name: "Start a new draft" })).toHaveCount(0);

    await rejection.getByRole("button", { name: "Discard and edit" }).click();
    await expect(dialog.getByRole("textbox", { name: "Community ID" })).toHaveValue(communityId);
    await expect(dialog.locator("#create-post-body")).toHaveValue(body);
    await expect(dialog.locator("[data-post-composer-state]")).toHaveCount(0);
  });
});
