import { defineConfig } from "playwright/test";
import shared from "./playwright.config.ts";

export default defineConfig(shared, {
  testIgnore: [],
  testMatch: "hns-staging-handoff.spec.ts",
  timeout: 420_000,
  workers: 1,
  retries: 0,
  use: { trace: "off", screenshot: "off", video: "off" },
});
