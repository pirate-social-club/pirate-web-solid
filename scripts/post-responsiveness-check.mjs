// Run against Storybook or a built catalog. Measures browser layout at phone
// and desktop widths, including long-content regression stories.
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const base = process.env.STORYBOOK_BASE_URL ?? (process.env.STORYBOOK_STATIC_DIRECTORY ? "http://127.0.0.1:6012" : "http://127.0.0.1:6006");
const server = process.env.STORYBOOK_STATIC_DIRECTORY
  ? spawn("python", ["-m", "http.server", "6012", "--directory", process.env.STORYBOOK_STATIC_DIRECTORY], { stdio: "ignore" })
  : undefined;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
});
const failures = [];
let checked = 0;
try {
  let index;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { index = await (await fetch(`${base}/index.json`)).json(); break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!index) throw new Error("Storybook index unavailable");
  const stories = Object.values(index.entries).filter(story => story.type === "story" && (/^(screens-posts-publicpostroute|screens-community-pageshell|screens-profiles-publicprofilepage|parts-posts-shared-engagement)--/u.test(story.id) || /^(screens-studying-studyv2route--auth-required|screens-karaoke-route--session-signed-out)(-mobile)?$/u.test(story.id)));
  if (!stories.length) throw new Error("No post, community, profile, comment or activity stories found");
  await Promise.all([320, 390, 1280].map(async width => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.route(/\/song\/playback-access/u, route => route.fulfill({ json: {
      kind: "full_mix", playback_url: "https://audio.example.test/responsive.wav",
      expires_at: Math.floor(Date.now() / 1000) + 900, renew_after: Math.floor(Date.now() / 1000) + 840,
    } }));
    await page.route("https://audio.example.test/**", route => route.fulfill({ status: 200, contentType: "audio/wav", body: Buffer.alloc(44) }));
    for (const story of stories) {
      try {
        if (process.env.RESPONSIVE_VERBOSE) console.error(`${width}: ${story.id}`);
        await page.goto(`${base}/iframe.html?id=${story.id}&viewMode=story`, { waitUntil: "load" });
        await page.waitForFunction(() => document.body.classList.contains("sb-show-main") && document.querySelector("#storybook-root")?.childElementCount > 0);
        await page.evaluate(async () => { await Promise.race([document.fonts.ready, new Promise((_, reject) => setTimeout(() => reject(new Error("Fonts did not settle")), 5000))]); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
        if (story.id.includes("--song-activities")) {
          await page.getByRole("dialog", { name: "Activities" }).waitFor();
          if (story.id.includes("rewards-") && !story.id.includes("unavailable")) {
            await page.getByText("Megapot · chance to win").waitFor();
            await page.waitForFunction(() => [...document.querySelectorAll("details")].some(element => element.open));
          }
        }
        await page.evaluate(async () => {
          await Promise.race([Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined))), new Promise(resolve => setTimeout(resolve, 1500))]);
        });
        const result = await page.evaluate(() => {
          const viewport = document.documentElement.clientWidth;
          const scrollWidth = document.documentElement.scrollWidth;
          const controls = [...document.querySelectorAll('[aria-haspopup="dialog"][title="Activities"], [role="dialog"]')].map(element => {
            const box = element.getBoundingClientRect();
            return { text: element.textContent, left: box.left, right: box.right };
          });
          const comment = document.querySelector('button[aria-label^="Comments ("]');
          const activities = document.querySelector('button[title="Activities"]');
          const rowAligned = !comment || !activities || Math.abs(comment.getBoundingClientRect().y - activities.getBoundingClientRect().y) <= 1;
          return { viewport, scrollWidth, controls, rowAligned };
        });
        checked++;
        if (!result.rowAligned || result.scrollWidth > result.viewport + 1 || result.controls.some(box => box.left < -1 || box.right > result.viewport + 1)) failures.push({ story: story.id, width, ...result });
        if (story.id.includes("--song-activities")) {
          const dialog = page.getByRole("dialog", { name: "Activities" });
          const box = await dialog.boundingBox();
          checked++;
          if (box.x < -1 || box.x + box.width > width + 1 || box.y < -1 || box.y + box.height > 901 || (width < 768 ? Math.abs(box.y + box.height - 900) > 2 : Math.abs(box.x + box.width / 2 - width / 2) > 2)) failures.push({ story: story.id, width, state: "dialog-position", box });
          if (process.env.ACTIVITIES_SCREENSHOT_DIRECTORY && (width === 390 || width === 1280) && /--song-activities-(mobile|rewards-mobile)$/u.test(story.id)) await page.screenshot({ path: `${process.env.ACTIVITIES_SCREENSHOT_DIRECTORY}/${story.id}-${width}.png` });
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "hidden" });
          await page.waitForFunction(() => document.activeElement?.getAttribute("title") === "Activities");
        }
        if (story.id === "screens-posts-publicpostroute--song-post-mobile") {
          await page.getByRole("button", { name: /^Play /u }).click();
          await page.locator("audio").waitFor();
          const playback = await page.evaluate(() => ({
            viewport: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
            audioRight: document.querySelector("audio").getBoundingClientRect().right,
          }));
          checked++;
          if (playback.scrollWidth > playback.viewport + 1 || playback.audioRight > playback.viewport + 1) failures.push({ story: story.id, width, state: "playback", ...playback });
        }
        if (width === 320 && story.id === "screens-posts-publicpostroute--song-post-mobile" && process.env.RESPONSIVE_SCREENSHOT_PATH) await page.screenshot({ path: process.env.RESPONSIVE_SCREENSHOT_PATH });
      } catch (error) { failures.push({ story: story.id, width, error: String(error) }); }
    }
    await page.close();
  }));
  console.log(JSON.stringify({ checked, stories: stories.length, widths: [320, 390, 1280], failures }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
  server?.kill();
}
