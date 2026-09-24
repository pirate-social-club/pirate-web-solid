import { defineConfig } from "playwright/test";
import shared from "./playwright.config.ts";

export default defineConfig(shared, {
  testIgnore: [],
  testMatch: ["hns-staging-handoff.spec.ts", "hns-staging-activation.spec.ts"],
  timeout: 420_000,
  workers: 1,
  retries: 0,
  // Bound every action so a missing element fails with its locator instead of
  // consuming the whole journey budget.
  use: { trace: "off", screenshot: "off", video: "off", actionTimeout: 30_000, navigationTimeout: 60_000 },
});
