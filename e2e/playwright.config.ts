import { defineConfig, devices } from "playwright/test";

import { e2eBaseURL } from "./fixtures/environment.ts";

// Raw DOM error contexts can contain credentials during profile confirmation.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

export default defineConfig({
  testDir: ".",
  // The M1 suite has a stricter attempt runner and global preflight. It is
  // selected only through e2e/happy-path.config.ts.
  testIgnore: ["happy-path.spec.ts", "hns-staging-handoff.spec.ts", "hns-staging-activation.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: process.env.CI === "true",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: "../.tmp/playwright-e2e",
  reporter: [["list"]],
  use: {
    baseURL: e2eBaseURL(),
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
