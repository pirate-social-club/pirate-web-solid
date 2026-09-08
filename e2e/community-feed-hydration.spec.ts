import { expect, test } from "playwright/test";

/**
 * The server resolves the community feed before it answers, and the client
 * adopts that serialized value rather than reading the feed again. Neither the
 * server-markup gate nor the app gate can show this: one renders without
 * scripts and the other mounts fresh. Only a browser loading a real response
 * observes serialization and hydration together.
 *
 * Needs a community whose public feed has at least one post. It reads
 * E2E_FEED_COMMUNITY_PATH_SEGMENT and skips visibly without one, the way the
 * route-authorized post spec does.
 */
const pathSegment = process.env.E2E_FEED_COMMUNITY_PATH_SEGMENT?.trim();

test.describe("community feed hydration", { tag: "@staging-readonly" }, () => {
  test.skip(
    pathSegment === undefined || pathSegment === "",
    "Set E2E_FEED_COMMUNITY_PATH_SEGMENT to a community whose public feed has posts.",
  );

  test("the served feed is adopted rather than read again", async ({ page }) => {
    const feedReads: string[] = [];
    page.on("request", request => {
      if (/\/public-communities\/[^/]+\/feed/u.test(new URL(request.url()).pathname)) {
        feedReads.push(request.url());
      }
    });

    const response = await page.goto(`/c/${pathSegment}`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    // The response body itself carries the feed: no pending card, and at least
    // one post already rendered before any client code has run.
    const served = await response!.text();
    expect(served).not.toContain("Loading community posts");
    expect(served).toMatch(/data-community-post='|data-community-post="/u);

    await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached" });
    await expect(page.locator("[data-community-post]").first()).toBeVisible();

    // Hydration adopts the serialized value; a read here would be a refetch of
    // something the reader already has.
    expect(feedReads).toEqual([]);
  });
});
