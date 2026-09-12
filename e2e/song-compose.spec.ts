import { hasE2eAuthCredentials, test } from "./fixtures/auth.ts";
import { publishSongAndVerifyPlayback } from "./fixtures/publish-song.ts";
import { readFile } from "node:fs/promises";

// One real song, published through the community page against the deployed
// API and object store. The local song gate supplies its own responses, so it
// proves the command sequence and nothing about the services; this is the test
// that proves the pipeline. It mutates staging and never runs against
// production.

const allowMutation = process.env.E2E_ALLOW_MUTATION === "1";
const communityPath = process.env.E2E_COMMUNITY_PATH_SEGMENT?.trim();

// This checked-in sound is a real, decodable MP3. A synthetic MPEG header is
// enough for the browser's file-type gate but cannot prove the processing
// service accepts audio.
const audioFixture = await readFile(new URL("../public/sounds/study/correct.mp3", import.meta.url));

test.describe("publish a song from a community page", { tag: "@staging-mutating" }, () => {
  test.setTimeout(600_000);
  test.skip(!allowMutation, "Set E2E_ALLOW_MUTATION=1 to publish staging content");
  test.skip(!hasE2eAuthCredentials(), "Set E2E_PRIVY_EMAIL and E2E_PRIVY_OTP for staging authentication");
  test.skip(
    !communityPath,
    "Set E2E_COMMUNITY_PATH_SEGMENT to a staging community this account belongs to with an active persona",
  );

  for (const [name, lyrics] of [
    ["with reviewed lyrics", "One line of reviewed lyrics"],
    ["as an instrumental", ""],
  ] as const) {
    test(`publishes a song ${name} exactly once`, async ({ page }) => {
      const marker = `E2E song ${Date.now()}`;
      await page.goto(`/c/${communityPath}`);
      await publishSongAndVerifyPlayback(page, marker, audioFixture, lyrics);

    });
  }
});
