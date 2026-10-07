import { defineConfig, devices } from "playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: ".", testMatch: "hns-wallet-local.spec.ts",
  fullyParallel: false, workers: 1, retries: 0, maxFailures: 1,
  forbidOnly: process.env.CI === "true",
  timeout: 30_000, expect: { timeout: 10_000 },
  outputDir: "../.tmp/hns-wallet-browser", reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"], headless: true,
    baseURL: "http://127.0.0.1:4197",
    screenshot: "only-on-failure", trace: "retain-on-failure", video: "off",
  },
  webServer: {
    command: "node scripts/hns-wallet-fixture-server.mjs",
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    url: "http://127.0.0.1:4197/__hns-wallet",
    reuseExistingServer: false, timeout: 60_000,
  },
});
