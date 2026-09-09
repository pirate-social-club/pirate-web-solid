import { expect, hasE2eAuthCredentials, test } from "./fixtures/auth.ts";
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
      /** Every publication of this submission, to prove there is exactly one. */
      const publications: string[] = [];
      const lyricsCommands: string[] = [];
      page.on("response", response => {
        const path = new URL(response.url()).pathname;
        if (response.request().method() !== "POST") return;
        if (/\/media-post-submissions\/[^/]+\/terms$/u.test(path)) publications.push(path);
        if (/\/media-post-submissions\/[^/]+\/lyrics$/u.test(path)) lyricsCommands.push(path);
      });

      await page.goto(`/c/${communityPath}`);
      await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached" });
      await page.getByRole("button", { name: "Post" }).click();

      const composer = page.getByRole("form", { name: "Create a post" });
      await expect(composer).toBeVisible();

      // Choosing a song is choosing the audio; the wizard follows the file.
      const stored = page.waitForResponse(response =>
        response.request().method() === "PUT" && response.status() < 400,
        { timeout: 120_000 });
      await composer.locator('input[aria-label="Upload audio"]').first().setInputFiles({
        name: `${marker}.mp3`,
        mimeType: "audio/mpeg",
        buffer: audioFixture,
      });
      await expect(composer.getByRole("navigation", { name: "Steps" })).toBeVisible();

      const title = composer.getByLabel("Song title", { exact: false });
      if (await title.count() > 0) await title.fill(marker);

      // Song, Lyrics, Rights, Review. Each advance waits for the exact next
      // step; unrelated status copy changing cannot satisfy the assertion.
      const forward = composer.locator("[data-composer-forward]");
      const currentStep = (name: string) => composer
        .getByRole("button", { name, exact: true })
        .and(composer.locator('[aria-current="step"]'));

      await forward.click();
      await expect(currentStep("Lyrics")).toBeVisible({ timeout: 120_000 });
      if (lyrics !== "") {
        await composer.getByLabel("Lyrics", { exact: true }).fill(lyrics);
        const saved = page.waitForResponse(response => response.request().method() === "POST"
          && /\/media-post-submissions\/[^/]+\/lyrics$/u.test(new URL(response.url()).pathname));
        await composer.getByRole("button", { name: "Save reviewed lyrics" }).click();
        expect((await saved).status()).toBeLessThan(400);
      }
      await forward.click();
      await expect(currentStep("Rights")).toBeVisible({ timeout: 120_000 });
      await forward.click();
      await expect(currentStep("Review")).toBeVisible({ timeout: 120_000 });

      // The audio reached the real object store before anything was published.
      expect((await stored).status()).toBeLessThan(400);

      const review = await composer.innerText();
      if (lyrics === "") expect(review).toContain("Instrumental");
      else expect(review).not.toContain("Instrumental");

      await composer.getByRole("button", { name: "Publish song" }).click();
      await expect(composer).toBeHidden({ timeout: 180_000 });

      expect(publications).toHaveLength(1);
      expect(lyricsCommands).toHaveLength(lyrics === "" ? 0 : 1);

      test.info().annotations.push({
        type: "cleanup-required",
        description: `No post-delete contract exists; staging content is identifiable by marker ${marker}`,
      });

      // The song is a post like any other, so it belongs in the feed.
      await page.reload();
      await expect(page.getByText(marker, { exact: false }).first()).toBeVisible({ timeout: 120_000 });
      const song=page.locator("[data-community-post]").filter({has:page.getByText(marker,{exact:false})}).first();
      await song.getByRole("button",{name:`Play ${marker}`,exact:true}).click();
      const audio=song.locator("audio");
      await expect(audio).toBeVisible();
      const playbackState = () => audio.evaluate(element => {
        if (!(element instanceof HTMLAudioElement)) throw new Error("Expected audio player");
        return {duration:element.duration,currentTime:element.currentTime};
      });
      await expect.poll(async () => {const state=await playbackState();return Number.isFinite(state.duration) && state.duration>0;}).toBe(true);
      await audio.evaluate(element => {
        if (!(element instanceof HTMLAudioElement)) throw new Error("Expected audio player");
        return element.play();
      });
      await expect.poll(async () => (await playbackState()).currentTime).toBeGreaterThan(0);
      await audio.evaluate(element => {
        if (!(element instanceof HTMLAudioElement)) throw new Error("Expected audio player");
        element.pause();element.currentTime=element.duration/2;
      });
      await expect.poll(async () => {const state=await playbackState();return Math.abs(state.currentTime-state.duration/2);}).toBeLessThan(0.1);

    });
  }
});
