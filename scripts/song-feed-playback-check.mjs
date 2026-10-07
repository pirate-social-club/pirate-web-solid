import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect } from "playwright/test";

// Exercise the actual feed card and player with local audio. The HTTPS grant
// and its media request are fulfilled in the browser; no provider is contacted.
const port = 6187;
const origin = `http://127.0.0.1:${port}`;
const mediaUrl = "https://audio.example.test/song-playback-layout.mp3";
const audioBytes = await readFile(new URL("../public/sounds/study/correct.mp3", import.meta.url));
let child;
let browser;
let startupLog = "";
try {
  if (await fetch(`${origin}/index.json`).then(() => true, () => false)) {
    throw new Error(`Playback check port ${port} is already in use`);
  }
  child = spawn(process.execPath, ["node_modules/storybook/dist/bin/dispatcher.js", "dev", "--port", String(port), "--exact-port", "--ci", "--no-open", "--disable-telemetry"], {
    cwd: new URL("..", import.meta.url), stdio: ["ignore", "pipe", "pipe"],
  });
  const record = chunk => { startupLog = (startupLog + chunk.toString()).slice(-4_096); };
  child.stdout.on("data", record);
  child.stderr.on("data", record);
  let spawnError;
  child.on("error", error => { spawnError = error; });
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error("Storybook exited before playback checks");
    try {
      const response = await fetch(`${origin}/index.json`);
      if (response.ok) break;
    } catch { /* Storybook is starting. */ }
    if (Date.now() >= deadline) throw new Error("Storybook did not become ready");
    await delay(250);
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(60_000);
      page.on("pageerror", error => console.error(`playback fixture: ${error.message}`));
      await page.route("**/api/posts/song-playback-layout/song/playback-access", route => {
        const now = Math.floor(Date.now() / 1_000);
        return route.fulfill({ json: { kind: "full_mix", playback_url: mediaUrl,
          expires_at: now + 600, renew_after: now + 540 } });
      });
      await page.route(mediaUrl, route => {
        const range = /^bytes=(\d+)-(\d*)$/u.exec(route.request().headers().range ?? "");
        const start = range ? Number(range[1]) : 0;
        const end = range?.[2] ? Math.min(Number(range[2]), audioBytes.length - 1) : audioBytes.length - 1;
        const body = audioBytes.subarray(start, end + 1);
        const headers = { "accept-ranges": "bytes", "content-length": String(body.length), "content-type": "audio/mpeg" };
        if (range) headers["content-range"] = `bytes ${start}-${end}/${audioBytes.length}`;
        return route.fulfill({ body, headers, status: range ? 206 : 200 });
      });
      await page.goto(`${origin}/iframe.html?id=screens-community-songplayback--desktop&viewMode=story`);
      await page.getByRole("button", { name: "Play Midnight Waves", exact: true }).click();
      const audio = page.getByLabel("Audio for Midnight Waves", { exact: true });
      await expect(audio).toBeVisible();
      const bounds = await audio.boundingBox();
      const card = await page.locator("[data-community-post='song-playback-layout']").boundingBox();
      expect(bounds.width).toBeGreaterThan(200);
      expect(bounds.x).toBeGreaterThanOrEqual(card.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(card.x + card.width);
      await expect.poll(() => audio.evaluate(element => element.currentTime)).toBeGreaterThan(0);
      await audio.evaluate(element => { element.pause(); element.currentTime = element.duration / 2; });
      await expect.poll(() => audio.evaluate(element => element.seeking ? Infinity : Math.abs(element.currentTime - element.duration / 2))).toBeLessThan(0.1);
      await audio.evaluate(element => element.play());
      await expect.poll(() => audio.evaluate(element => element.currentTime - element.duration / 2)).toBeGreaterThan(0.2);
      expect(await audio.evaluate(element => element.error?.code ?? null)).toBeNull();
      console.log(JSON.stringify({ viewport: width, controlsWidth: bounds.width, playback: "passed", seeking: "passed", resume: "passed" }));
    } finally { await context.close(); }
  }
} catch (error) {
  console.error(error);
  if (!browser) console.error(startupLog);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    for (let n = 0; n < 20 && child.exitCode === null; n += 1) await delay(100);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}
