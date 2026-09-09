import { expect, hasE2eAuthCredentials, test } from "./fixtures/auth.ts";

// One real song, published through the community page against the deployed
// API and object store. The local song gate supplies its own responses, so it
// proves the command sequence and nothing about the services; this is the test
// that proves the pipeline. It mutates staging and never runs against
// production.

const allowMutation = process.env.E2E_ALLOW_MUTATION === "1";
const communityPath = process.env.E2E_COMMUNITY_PATH_SEGMENT?.trim();

/** A minimal MPEG audio frame; the composer accepts MP3 by type and extension. */
function mp3(name: string) {
  const buffer = Buffer.alloc(4_096);
  buffer[0] = 0xff;
  buffer[1] = 0xfb;
  buffer[2] = 0x90;
  buffer[3] = 0x00;
  return { name, mimeType: "audio/mpeg", buffer };
}

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
      await page.getByRole("button", { name: "Post here" }).click();

      const composer = page.getByRole("form", { name: "Create a post" });
      await expect(composer).toBeVisible();

      // Choosing a song is choosing the audio; the wizard follows the file.
      const stored = page.waitForResponse(response =>
        response.request().method() === "PUT" && response.status() < 400,
        { timeout: 120_000 });
      await composer.locator('input[aria-label="Upload audio"]').first().setInputFiles(mp3(`${marker}.mp3`));
      await expect(composer.getByRole("navigation", { name: "Steps" })).toBeVisible();

      const title = composer.getByLabel("Song title", { exact: false });
      if (await title.count() > 0) await title.fill(marker);

      // Song, Lyrics, Rights, Review. The forward control is named for the
      // step it opens, so it is addressed directly rather than by label, and
      // each advance waits for the step to change before the next.
      const forward = composer.locator("[data-composer-forward]");
      for (let step = 0; step < 6; step += 1) {
        if (await composer.getByRole("button", { name: "Publish song" }).count() > 0) break;
        const lyricsField = composer.getByLabel("Lyrics", { exact: true });
        if (lyrics !== "" && await lyricsField.count() > 0) {
          await lyricsField.fill(lyrics);
          const save = composer.getByRole("button", { name: "Save reviewed lyrics" });
          if (await save.count() > 0 && !await save.isDisabled()) await save.click();
        }
        await expect(forward).toBeVisible();
        const before = await composer.innerText();
        await forward.click();
        await expect
          .poll(async () => composer.innerText(), { timeout: 120_000 })
          .not.toBe(before);
      }

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
    });
  }
});
