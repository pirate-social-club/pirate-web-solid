import { expect, hasE2eAuthCredentials, test } from "./fixtures/auth.ts";

// The composer a member actually opens: the community page's own Post here
// action, not the global entry with a raw community identifier typed into it.
// The surface under test is the one that ships, so the assertions follow it —
// the body lives in the framed composer's Description field, and a successful
// publication closes the form rather than leaving a message inside it.

const allowMutation = process.env.E2E_ALLOW_MUTATION === "1";
const communityPath = process.env.E2E_COMMUNITY_PATH_SEGMENT?.trim()
  ?? process.env.E2E_ROUTE_AUTHORIZED_COMMUNITY_ID?.trim();

test.describe("post to a community from its own page", { tag: "@staging-mutating" }, () => {
  test.skip(!allowMutation, "Set E2E_ALLOW_MUTATION=1 to publish staging content");
  test.skip(!hasE2eAuthCredentials(), "Set E2E_PRIVY_EMAIL and E2E_PRIVY_OTP for staging authentication");
  test.skip(
    !communityPath,
    "Set E2E_COMMUNITY_PATH_SEGMENT to a staging community this account belongs to with an active persona",
  );

  test("publishes a conversation and shows it in the feed", async ({ page }) => {
    const marker = `E2E text post ${Date.now()}`;
    await page.goto(`/c/${communityPath}`);
    await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached" });

    const postHere = page.getByRole("button", { name: "Post here" });
    await expect(postHere).toBeVisible();
    await postHere.click();

    const composer = page.getByRole("form", { name: "Create a post" });
    await expect(composer).toBeVisible();
    // The composer inherits the community and the persona from the page, so
    // neither is asked for here. A raw identifier field would be a regression.
    await expect(composer.getByRole("textbox", { name: "Community ID" })).toHaveCount(0);
    await composer.getByLabel("Title", { exact: true }).fill(marker);
    await composer.getByLabel("Description", { exact: true }).fill(marker);

    const published = page.waitForResponse(response =>
      response.request().method() === "POST"
      && /\/api\/communities\/[^/]+\/posts$/u.test(new URL(response.url()).pathname));
    await composer.getByRole("button", { name: "Publish post" }).click();
    expect((await published).status()).toBe(201);

    // Completing the operation closes it; a lingering form is a dead end.
    await expect(composer).toBeHidden();

    test.info().annotations.push({
      type: "cleanup-required",
      description: `No post-delete contract exists; staging content is identifiable by marker ${marker}`,
    });
    await page.reload();
    await expect(page.getByText(marker, { exact: true }).first()).toBeVisible();
  });
});
