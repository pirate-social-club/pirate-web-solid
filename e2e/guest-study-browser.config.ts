import { defineConfig, devices } from "playwright/test";
const base = process.env.GUEST_STUDY_BROWSER_ORIGIN;
if (base === undefined) throw new Error("Use the owned guest-study-browser-check runner");
const url = new URL(base);
if (url.origin !== base || url.protocol !== "https:" || url.hostname !== "127.0.0.1")
  throw new Error("Owned HTTPS loopback origin required");
export default defineConfig({
  testDir: ".", testMatch: "guest-study-browser.spec.ts", workers: 1, fullyParallel: false, retries: 0, forbidOnly: true,
  timeout: 45_000, expect: { timeout: 10_000 },
  outputDir: process.env.GUEST_STUDY_BROWSER_RESULTS,
  reporter: [["list"]],
  use: { ...devices["Desktop Chrome"], baseURL: base, ignoreHTTPSErrors: true,
    screenshot: "only-on-failure", video: "off", trace: "off",
    launchOptions: { ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE === undefined ? {} : {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    }) },
  },
});
