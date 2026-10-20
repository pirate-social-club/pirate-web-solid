import { expect, test } from "./fixtures/auth.ts";
import { requireMutationEnvironment } from "./fixtures/environment.ts";

/** Parent-run only, against an admitted serving pair and real durable delivery.
 * The supplied evidence digest binds the publication/storage proof held by the
 * parent. Neither this UI test nor an inbox row establishes that proof alone.
 * The existing secret runner owns authentication; this file provisions nothing.
 */
function acceptanceCase() {
  const notificationId = process.env.NOTIFICATIONS_ACCEPTANCE_NOTIFICATION_ID ?? "";
  const commentId = process.env.NOTIFICATIONS_ACCEPTANCE_COMMENT_ID ?? "";
  const postPath = process.env.NOTIFICATIONS_ACCEPTANCE_POST_PATH ?? "";
  const evidence = process.env.NOTIFICATIONS_PUBLICATION_EVIDENCE_SHA256 ?? "";
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(notificationId)
    || !commentId || commentId.length > 512 || /[\u0000-\u001f\u007f]/u.test(commentId)
    || !/^\/(?:post|posts)\/[^/?#]+$/u.test(postPath)
    || new URL(postPath, "https://pirate.invalid").pathname !== postPath
    || !/^[0-9a-f]{64}$/u.test(evidence)) {
    throw new Error("Parent must supply a real unread delivery, exact target/path and durable publication evidence digest before browser acceptance.");
  }
  return { notificationId, commentId, postPath, evidence };
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Notifications ${viewport.width}`, { tag: "@notifications-navigation" }, () => {
    test.beforeAll(() => { acceptanceCase(); });
    test.use({ viewport });
    test("real inbox reaches the rendered inline target without marking it read", async ({ page }, testInfo) => {
      const fixture = acceptanceCase();
      testInfo.annotations.push({ type: "parent-publication-evidence-sha256", description: fixture.evidence });
      const writes: string[] = [], pages: string[] = [];
      page.on("request", request => {
        const path = new URL(request.url()).pathname;
        if (request.method() !== "GET" && /\/api\/(?:me\/notifications|comments|posts)/u.test(path)) writes.push(path);
        if (request.method() === "GET" && /\/api\/posts\/[^/]+\/comments$/u.test(path)) pages.push(request.url());
      });
      await page.goto("/activity", { waitUntil: "domcontentloaded" });
      await expect(page.locator("#app-root[data-hydrated='true']")).toBeAttached();
      const row = page.locator(`[data-notification-id="${fixture.notificationId}"]`);
      await expect(row).toContainText("Unread");
      await expect(row.getByRole("link")).toHaveAttribute("href", `/comments/${encodeURIComponent(fixture.commentId)}`);
      await row.getByRole("link").click();
      await page.waitForURL(url => url.pathname === fixture.postPath && url.searchParams.getAll("comment").length === 1 && url.searchParams.get("comment") === fixture.commentId);
      await expect(page.locator("[data-public-post-state='content']")).toBeVisible();
      // Compare DOM attributes directly; arbitrary IDs never enter a selector.
      await expect.poll(() => page.locator("[data-comment-id]").evaluateAll((rows, id) => {
        const matches = rows.filter(row => row.getAttribute("data-comment-id") === id);
        return matches.length === 1 && matches[0]!.getAttribute("data-comment-state") === "published"
          && (matches[0]!.textContent?.trim().length ?? 0) > 0;
      }, fixture.commentId)).toBe(true);
      await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-inline-comment"))).toBe(fixture.commentId);
      expect(pages, "Target discovery must use bounded resolver windows, not a first-page scan").toEqual([]);
      expect(writes, "Navigation must not mark read or mutate comments").toEqual([]);
      await page.goBack();
      await expect(page.locator(`[data-notification-id="${fixture.notificationId}"]`)).toContainText("Unread");
      await page.goForward();
      await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-inline-comment"))).toBe(fixture.commentId);
      expect(writes).toEqual([]);
      await page.getByRole("link", { name: "View all comments", exact: true }).click();
      await page.waitForURL(url => url.pathname === fixture.postPath && !url.searchParams.has("comment"));
      await expect.poll(() => pages.length).toBeGreaterThan(0);
    });
  });
}

test.describe("Notifications explicit read", { tag: "@notifications-read-mutation" }, () => {
  test.beforeAll(() => { acceptanceCase(); requireMutationEnvironment(); });
  test("only the explicit read control acknowledges the real recipient row", async ({ page }) => {
    const fixture = acceptanceCase();
    await page.goto("/activity");
    const row = page.locator(`[data-notification-id="${fixture.notificationId}"]`);
    await expect(row).toContainText("Unread");
    const acknowledgment = page.waitForResponse(response => new URL(response.url()).pathname === `/api/me/notifications/${fixture.notificationId}/read` && response.request().method() === "POST");
    await row.getByRole("button", { name: "Mark read", exact: true }).click();
    expect((await acknowledgment).status()).toBe(200);
    await expect(row).toContainText("Read");
    await expect(row.getByRole("button", { name: "Mark read", exact: true })).toHaveCount(0);
  });
});
