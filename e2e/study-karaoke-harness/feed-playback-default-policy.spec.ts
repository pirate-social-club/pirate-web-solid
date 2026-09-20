import { chromium, expect, test, type Browser, type Page } from "playwright/test";
import { harnessManifest, type HarnessManifest } from "./fixtures/harness.ts";

/**
 * Normal browser autoplay policy. Unlike the main harness projects, this
 * browser launches without `--autoplay-policy=no-user-gesture-required`, so
 * the application's own gate is what keeps the initial card paused, and the
 * explicit Play control is exercised as a real user gesture. The sticky
 * document activation Chromium grants after that click is what lets the next
 * row autoplay; that is browser policy, not the application gate.
 */

let manifest: HarnessManifest;
test.beforeAll(() => {
  manifest = harnessManifest();
});

const currentTime = (page: Page) => page.locator("[data-video-feed-card]").nth(0).locator("video")
  .evaluate(element => (element as HTMLVideoElement).currentTime);
const rowTime = (page: Page, row: number) => page.locator("[data-video-feed-card]").nth(row).locator("video")
  .evaluate(element => (element as HTMLVideoElement).currentTime);
const isPaused = (page: Page, row: number) => page.locator("[data-video-feed-card]").nth(row).locator("video")
  .evaluate(element => (element as HTMLVideoElement).paused);
const isMuted = (page: Page, row: number) => page.locator("[data-video-feed-card]").nth(row).locator("video")
  .evaluate(element => (element as HTMLVideoElement).muted);

test("the application gate holds under the default autoplay policy", async () => {
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--disable-features=LocalNetworkAccessChecks",
        "--ignore-certificate-errors",
        "--host-resolver-rules=MAP customer-harness.cloudflarestream.com 127.0.0.1:8443",
      ],
    });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const secure = manifest.appOrigin.replace(/^http:/u, "https:");
    await context.addCookies([
      { name: manifest.sessionCookieName, value: manifest.accounts[20]!.sessionToken, url: secure, secure: true, httpOnly: true, sameSite: "Lax" },
      { name: manifest.csrfCookieName, value: manifest.csrfToken, url: secure, secure: true, sameSite: "Lax" },
    ]);
    const page = await context.newPage();
    await page.goto(manifest.appOrigin + "/", { waitUntil: "load", timeout: 30_000 });
    await expect(page.locator("main[data-video-feed-state]")).toHaveAttribute("data-video-feed-state", "ready", { timeout: 30_000 });
    const firstCard = page.locator("[data-video-feed-card]").nth(0);
    await expect(firstCard.locator("[data-video-player-play]")).toBeVisible({ timeout: 30_000 });

    // No programmatic play may be attempted before a user gesture: the
    // application gate, not the browser policy, owns this pause.
    await expect.poll(() => currentTime(page), { timeout: 5_000 }).toBe(0);
    await page.waitForTimeout(1_200);
    expect(await currentTime(page)).toBe(0);
    expect(await isPaused(page, 0)).toBe(true);

    // Mute first is sound only and still does not start playback.
    await firstCard.locator("[data-video-feed-mute]").click();
    await expect.poll(() => isMuted(page, 0), { timeout: 10_000 }).toBe(true);
    expect(await currentTime(page)).toBe(0);

    // The explicit Play control is the user gesture that plays.
    await firstCard.locator("[data-video-player-play]").click();
    await expect.poll(() => currentTime(page), { timeout: 15_000 }).toBeGreaterThan(0.2);
    expect(await isMuted(page, 0)).toBe(true);

    // With document activation granted, the next active row autoplays under
    // both the application gate and the browser policy.
    await page.locator('[role="region"]').first().evaluate(element => {
      element.scrollTo({ top: element.clientHeight, behavior: "instant" });
    });
    await page.waitForTimeout(400);
    await expect.poll(() => rowTime(page, 1), { timeout: 15_000 }).toBeGreaterThan(0.1);
    expect(await isPaused(page, 0)).toBe(true);
  } finally {
    await browser?.close();
  }
});
