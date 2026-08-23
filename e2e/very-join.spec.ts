import { expect, hasE2eAuthCredentials, test } from "./fixtures/auth.ts";

const allowMutation = process.env.E2E_ALLOW_MUTATION === "1";
const communityId = process.env.E2E_VERY_JOIN_COMMUNITY_ID?.trim();

test.describe("Very join scan boundary", { tag: "@staging-mutating" }, () => {
  test.skip(!allowMutation, "Set E2E_ALLOW_MUTATION=1 to create a staging Very proof session");
  test.skip(!hasE2eAuthCredentials(), "Set E2E_PRIVY_EMAIL and E2E_PRIVY_OTP for staging authentication");
  test.skip(
    !communityId,
    "Set E2E_VERY_JOIN_COMMUNITY_ID to a Very-gated community not yet joined by the E2E account",
  );

  test("mounts the pinned desktop widget and stops before the palm scan", async ({ page }) => {
    const browserErrors: string[] = [];
    page.on("console", message => {
      if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", error => browserErrors.push(`pageerror: ${error.message}`));

    await page.goto(`/verify/very?community_id=${encodeURIComponent(communityId!)}`);
    await expect(page.getByRole("textbox", { name: "Gated community ID" })).toHaveValue(communityId!);

    const started = page.waitForResponse(response =>
      response.request().method() === "POST" && new URL(response.url()).pathname === "/api/verification/sessions"
    );
    const bridge = page.waitForResponse(response =>
      response.request().method() === "POST" && response.url() === "https://bridge.very.org/api/v1/sessions"
    );
    await page.getByRole("button", { name: "Start palm verification" }).click();

    expect((await started).status()).toBe(201);
    expect((await bridge).ok()).toBe(true);
    await expect(page.locator("#very-widget.very-widget")).toBeVisible();
    await expect(page.locator(".very-dialog-overlay")).toBeVisible();
    await expect(page.locator(".very-qr-container svg")).toBeVisible();
    await expect(page.locator("img[alt='VeryAI']")).toBeVisible();
    expect(browserErrors).toEqual([]);

    test.info().annotations.push({
      type: "manual-step-required",
      description: "A physical Very palm scan is required after the desktop QR boundary",
    });
    await page.locator(".very-close").click();
    await expect(page.getByRole("alert")).toContainText("Very verification was dismissed");
  });
});
