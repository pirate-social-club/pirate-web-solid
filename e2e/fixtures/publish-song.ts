import type { Page } from "playwright/test";
import { expect, test } from "./auth.ts";

export async function publishSongAndVerifyPlayback(page: Page, marker: string, audioFixture: Buffer, lyrics = ""): Promise<void> {
  /** Every publication of this submission, to prove there is exactly one. */
  const publications: string[] = [];
  const lyricsCommands: string[] = [];
  page.on("response", response => {
    const path = new URL(response.url()).pathname;
    if (response.request().method() !== "POST" || !response.ok()) return;
    if (/\/media-post-submissions\/[^/]+\/terms$/u.test(path)) publications.push(path);
    if (/\/media-post-submissions\/[^/]+\/lyrics$/u.test(path)) lyricsCommands.push(path);
  });

  await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached" });
  await page.getByRole("button", { name: "Post" }).click();

  const composer = page.getByRole("form", { name: "Create a post" });
  await expect(composer).toBeVisible();

  // Choosing a song is choosing the audio; the wizard follows the file.
  const storedPromise = page.waitForResponse(response =>
    response.request().method() === "PUT" && response.status() < 400,
    { timeout: 120_000 });
  void storedPromise.catch(() => {}); // The later await still reports failure; avoid an unhandled rejection if UI steps fail first.
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
    const [saved] = await Promise.all([
      page.waitForResponse(response => response.request().method() === "POST"
        && /\/media-post-submissions\/[^/]+\/lyrics$/u.test(new URL(response.url()).pathname)),
      composer.getByRole("button", { name: "Save reviewed lyrics" }).click(),
    ]);
    expect(saved.ok()).toBe(true);
  }
  await forward.click();
  await expect(currentStep("Rights")).toBeVisible({ timeout: 120_000 });
  await forward.click();
  await expect(currentStep("Review")).toBeVisible({ timeout: 120_000 });

  // The audio reached the real object store before anything was published.
  expect((await storedPromise).status()).toBeLessThan(400);

  const review = await composer.innerText();
  if (lyrics === "") expect(review).toContain("Instrumental");
  else expect(review).not.toContain("Instrumental");

  await composer.getByRole("button", { name: "Publish song" }).click();
  await expect(composer).toBeHidden({ timeout: 180_000 });

  expect(publications).toHaveLength(1);
  expect(lyricsCommands).toHaveLength(lyrics === "" ? 0 : 1);

  test.info().annotations.push({
    type: "cleanup-required",
    description: `No delete contract exists; community ${new URL(page.url()).pathname} and its song use marker ${marker}`,
  });

  // The song is a post like any other, so it belongs in the feed.
  await page.reload();
  await expect(page.getByText(marker, { exact: false }).first()).toBeVisible({ timeout: 120_000 });
  const song=page.locator("[data-community-post]").filter({has:page.getByText(marker,{exact:false})});
  await expect(song).toHaveCount(1);
  await song.getByRole("button",{name:`Play ${marker}`,exact:true}).click();
  const audio=song.locator("audio");
  await expect(audio).toBeVisible();
  const playbackState = () => audio.evaluate(element => {
    if (!(element instanceof HTMLAudioElement)) throw new Error("Expected audio player");
    return {duration:element.duration,currentTime:element.currentTime,seeking:element.seeking,error:element.error?.code ?? null};
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
  await expect.poll(async () => {const state=await playbackState();return state.seeking ? Infinity : Math.abs(state.currentTime-state.duration/2);}).toBeLessThan(0.1);

  expect((await playbackState()).error).toBeNull();
  await audio.evaluate(element => (element as HTMLAudioElement).play());
  await expect.poll(async () => { const state = await playbackState(); return state.currentTime - state.duration / 2; }).toBeGreaterThan(0.2);
}
