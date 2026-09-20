import { expect, test, type Locator, type Page } from "playwright/test";
import { harnessManifest, useAccount, type HarnessManifest } from "./fixtures/harness.ts";

/**
 * Playback policy for the production video card. The card renders through the
 * feed's placeholder path, so these journeys prove it obeys the same active
 * row, interaction, mute and background rules as a normal media card: actual
 * advancing currentTime, swipe-to-next, previous-video pause, resume on return
 * and the feed-wide mute, all against real local HLS media.
 */

let manifest: HarnessManifest;
test.beforeAll(() => {
  manifest = harnessManifest();
});

const regionOf = (page: Page) => page.locator('[role="region"]').first();

async function openFeed(context: Parameters<typeof useAccount>[0], page: Page, index: number): Promise<void> {
  await useAccount(context, manifest, index);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator("main[data-video-feed-state]")).toHaveAttribute(
    "data-video-feed-state",
    "ready",
    { timeout: 30_000 },
  );
  await expect(page.locator("[data-video-feed-card]").first().locator('[data-video-player-state="ready"]'))
    .toHaveCount(1, { timeout: 30_000 });
}

async function scrollToRow(page: Page, row: number): Promise<void> {
  // The feed's own scroll handler derives the active index from scrollTop, so
  // this drives the same path a swipe does.
  await regionOf(page).evaluate((element, index) => {
    element.scrollTo({ top: index * element.clientHeight, behavior: "instant" });
  }, row);
  await page.waitForTimeout(400);
}

const currentTime = (video: Locator) => video.evaluate(element => (element as HTMLVideoElement).currentTime);
const isPaused = (video: Locator) => video.evaluate(element => (element as HTMLVideoElement).paused);
const isMuted = (video: Locator) => video.evaluate(element => (element as HTMLVideoElement).muted);

test("the active video advances after interaction, and the next video takes over the play position", async ({
  context,
  page,
}) => {
  await openFeed(context, page, 20);
  const first = page.locator("[data-video-feed-card]").nth(0).locator("video");

  // Feed policy before any interaction: the active card is paused, not playing.
  expect(await isPaused(first)).toBe(true);

  // A real click on the player is the interaction that unlocks the feed gate.
  await first.click();
  await expect.poll(() => currentTime(first), { timeout: 15_000 }).toBeGreaterThan(0.2);
  const firstTime = await currentTime(first);
  await page.waitForTimeout(700);
  expect(await currentTime(first)).toBeGreaterThan(firstTime);

  // Swipe to the next video: it autoplays on the already-unlocked gate and the
  // previous video pauses.
  await scrollToRow(page, 1);
  const second = page.locator("[data-video-feed-card]").nth(1).locator("video");
  await expect.poll(() => currentTime(second), { timeout: 15_000 }).toBeGreaterThan(0.1);
  expect(await isPaused(first)).toBe(true);

  // Swiping back resumes the first video and pauses the second.
  await scrollToRow(page, 0);
  await expect.poll(() => currentTime(first), { timeout: 15_000 }).toBeGreaterThan(firstTime);
  expect(await isPaused(second)).toBe(true);
});

test("the feed mute control mutes every playable card", async ({ context, page }) => {
  await openFeed(context, page, 21);
  const first = page.locator("[data-video-feed-card]").nth(0).locator("video");
  const firstMute = page.locator("[data-video-feed-card]").nth(0).locator("[data-video-feed-mute]");
  await first.click();
  await expect.poll(() => currentTime(first), { timeout: 15_000 }).toBeGreaterThan(0.2);
  expect(await isMuted(first)).toBe(false);

  await firstMute.click();
  await expect.poll(() => isMuted(first), { timeout: 10_000 }).toBe(true);
  await expect(firstMute).toHaveAttribute("aria-pressed", "true");

  // Feed-wide policy: the next card inherits the mute.
  await scrollToRow(page, 1);
  const second = page.locator("[data-video-feed-card]").nth(1).locator("video");
  await expect.poll(() => isMuted(second), { timeout: 10_000 }).toBe(true);
});

test("backgrounding pauses playback and returning resumes it", async ({ context, page }) => {
  await openFeed(context, page, 22);
  const first = page.locator("[data-video-feed-card]").nth(0).locator("video");
  await first.click();
  await expect.poll(() => currentTime(first), { timeout: 15_000 }).toBeGreaterThan(0.2);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => isPaused(first), { timeout: 10_000 }).toBe(true);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => currentTime(first), { timeout: 15_000 }).toBeGreaterThan(0.1);
});
