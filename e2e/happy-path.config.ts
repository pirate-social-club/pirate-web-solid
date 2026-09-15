import { defineConfig } from "playwright/test";

import shared from "./playwright.config.ts";

export default defineConfig(shared, {
  testMatch: "happy-path.spec.ts",
  globalSetup: "./fixtures/happy-path-global-preflight.ts",
  timeout: 900_000,
  workers: 1,
  retries: 0,
  use: { trace: "off", screenshot: "off", video: "off" },
});
