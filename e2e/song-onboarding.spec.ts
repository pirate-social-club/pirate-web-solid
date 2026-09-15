import { readFile } from "node:fs/promises";
import { test } from "./fixtures/auth.ts";
import { createCommunity } from "./fixtures/create-community.ts";
import { publishSongAndVerifyPlayback } from "./fixtures/publish-song.ts";
import preflight from "./fixtures/song-onboarding-preflight.ts";

const audioFixture = await readFile(new URL("./fixtures/song-instrumental.mp3", import.meta.url));

test.describe("Privy account creates a community and posts a playable song", { tag: "@song-onboarding" }, () => {
  test.setTimeout(600_000);
  test.beforeAll(() => preflight());
  test("publishes an instrumental and plays it after reload", async ({ page }) => {
      const marker = `E2E song ${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const communityPath = await test.step("Create a community through the UI", () => createCommunity(page, marker));
      await page.goto(communityPath);
      await publishSongAndVerifyPlayback(page, marker, audioFixture);
  });
});
