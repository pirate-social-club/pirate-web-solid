import { defineConfig, devices } from "playwright/test";

const baseURL = process.env.E2E_BASE_URL?.trim() || "https://web-next-staging.pirate.sc";

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: process.env.CI === "true",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: "../.tmp/playwright-e2e",
  reporter: [["list"]],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
