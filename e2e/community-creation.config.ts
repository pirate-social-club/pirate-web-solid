import { defineConfig } from "playwright/test";
import shared from "./playwright.config.ts";

export default defineConfig(shared, {
  testMatch: "community-creation.spec.ts",
  globalSetup: "./fixtures/community-creation-preflight.ts",
  timeout: 180_000,
  workers: 1,
  retries: 0,
  use: { trace: "off", screenshot: "off", video: "off" },
});
