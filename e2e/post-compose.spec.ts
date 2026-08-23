import { expect, hasE2eAuthCredentials, test } from "./fixtures/auth.ts";

const allowMutation = process.env.E2E_ALLOW_MUTATION === "1";
const communityId = process.env.E2E_ROUTE_AUTHORIZED_COMMUNITY_ID?.trim();

test.describe("post to a route-authorized community", { tag: "@staging-mutating" }, () => {
  test.skip(!allowMutation, "Set E2E_ALLOW_MUTATION=1 to publish staging content");
  test.skip(!hasE2eAuthCredentials(), "Set E2E_PRIVY_EMAIL and E2E_PRIVY_OTP for staging authentication");
  test.skip(
    !communityId,
    "Set E2E_ROUTE_AUTHORIZED_COMMUNITY_ID after the HNS lane supplies a real route-authorized community",
  );

  test("publishes through the exact replay transport and appears in the feed", async ({ page }) => {
    const marker = `E2E route-authorized post ${Date.now()}`;
    await page.goto("/");
    await page.getByRole("button", { name: "Create post", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create a post" });
    await dialog.getByRole("textbox", { name: "Community ID" }).fill(communityId!);
    await dialog.getByRole("textbox", { name: /^Title/u }).fill(marker);
    await dialog.locator("#create-post-body").fill(marker);

    const published = page.waitForResponse(response =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname === `/api/communities/${communityId}/posts`
    );
    await dialog.getByRole("button", { name: "Publish post" }).click();
    expect((await published).status()).toBe(201);
    await expect(dialog.getByText("Post published.", { exact: true })).toBeVisible();

    test.info().annotations.push({
      type: "cleanup-required",
      description: `No post-delete contract exists; staging content is identifiable by marker ${marker}`,
    });
    await page.reload();
    await expect(page.getByText(marker, { exact: true }).first()).toBeVisible();
  });
});
