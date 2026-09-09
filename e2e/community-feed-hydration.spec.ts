import { expect, test } from "playwright/test";

/**
 * The server resolves the community feed before it answers, and the client
 * adopts that serialized value rather than reading the feed again. Neither the
 * server-markup gate nor the app gate can show this: one renders without
 * scripts and the other mounts fresh. Only a browser loading a real response
 * observes serialization and hydration together.
 *
 * Needs a community that satisfies two separate conditions, both of which have
 * to hold before this can produce evidence:
 *
 *   - it resolves at /c/<segment>, which means it carries a route; a community
 *     whose preview reports route_slug null never will, and an id that is not
 *     community_<uuid> is read as a route label rather than an id
 *   - its public feed endpoint answers, since a community that 404s there
 *     renders the honest error state and carries no posts to adopt
 *
 * As of 2026-09-09 no staging community meets both. The two with public posts,
 * staging-song-pipeline and community-very-staging-fixture-moderation-e2e,
 * report route_slug null and 404 on /public-communities/<ref>/feed.
 *
 * It reads E2E_FEED_COMMUNITY_PATH_SEGMENT and skips visibly without one.
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
    // one post already rendered before any client code has run. A community
    // whose feed endpoint 404s renders the error state instead, which is a
    // staging-data condition rather than a hydration failure.
    const served = await response!.text();
    expect(served, "the community's public feed did not answer, so there is nothing to adopt")
      .not.toContain("Community posts are temporarily unavailable");
    expect(served).not.toContain("Loading community posts");
    expect(served).toMatch(/data-community-post='|data-community-post="/u);

    await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached" });
    await expect(page.locator("[data-community-post]").first()).toBeVisible();

    // Hydration adopts the serialized value; a read here would be a refetch of
    // something the reader already has.
    expect(feedReads).toEqual([]);
  });
});
