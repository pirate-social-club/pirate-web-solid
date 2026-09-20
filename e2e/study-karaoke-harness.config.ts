import { defineConfig, devices } from "playwright/test";
import { silenceCaptureWav, toneCaptureWav } from "./study-karaoke-harness/paths.ts";

/**
 * Local Study/Karaoke browser harness configuration.
 *
 * It drives the real Solid application against the local harness Worker
 * (api-next) and a disposable PostgreSQL. Only provider transport is scripted.
 *
 * Requirements before running:
 * - the api-next harness Worker on http://127.0.0.1:8788 (its README),
 * - the Solid application build previewed on http://127.0.0.1:8787
 *   (`bun run build` then `bun x vite preview --host 127.0.0.1 --port 8787`);
 *   the Vite dev server's hydration scripts are blocked by its own CSP,
 * - the seeded harness manifest (api-next tests/study-karaoke-harness).
 *
 * One Chromium worker, no parallel shards. Specs tagged @silent-audio run in
 * the second project with a genuinely silent fake capture file.
 */
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

const baseArgs = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
  // Chromium 138+ blocks a local document's WebSocket to another loopback port
  // with ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS; the harness API socket is
  // explicitly loopback, so the check is disabled for this local browser only.
  "--disable-features=LocalNetworkAccessChecks",
  // The harness mints Stream-shaped playback grants but serves the media from a
  // loopback TLS server; map the customer host and trust its local certificate.
  "--ignore-certificate-errors",
  "--host-resolver-rules=MAP customer-harness.cloudflarestream.com 127.0.0.1:8443",
];

export default defineConfig({
  testDir: "./study-karaoke-harness",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: false,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  outputDir: "../.tmp/playwright-study-karaoke",
  reporter: [["list"], ["json", { outputFile: "../.tmp/study-karaoke-harness-results.json" }]],
  globalSetup: "./study-karaoke-harness/global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:8787",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      grepInvert: /@silent-audio|@default-autoplay/u,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [...baseArgs, `--use-file-for-fake-audio-capture=${toneCaptureWav}`],
        },
      },
    },
    {
      name: "chromium-silent",
      grep: /@silent-audio/u,
      grepInvert: /@default-autoplay/u,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [...baseArgs, `--use-file-for-fake-audio-capture=${silenceCaptureWav}`],
        },
      },
    },
    {
      // The browser's normal autoplay policy. The permissive projects above
      // prove the application's gate; this project proves the same journey
      // with autoplay actually blocked, so a user gesture (Play, not Mute) is
      // what starts playback.
      name: "chromium-default-autoplay",
      grep: /@default-autoplay/u,
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            ...baseArgs.filter(arg => !arg.startsWith("--autoplay-policy")),
            `--use-file-for-fake-audio-capture=${toneCaptureWav}`,
          ],
        },
      },
    },
  ],
});
