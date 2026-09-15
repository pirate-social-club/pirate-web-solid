import { defineConfig } from "playwright/test";
import common from "./playwright.config.ts";

export default defineConfig({
  ...common,
  testMatch: "song-onboarding.spec.ts",
  globalSetup: "./fixtures/song-onboarding-preflight.ts",
  timeout: 600_000,
  use: { ...common.use, trace: "off", screenshot: "off", video: "off" },
});
