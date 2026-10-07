import type { PirateApiClient } from "@pirate/api-client";
import type { Page, Request, Response, TestInfo } from "playwright/test";
import { expect, test } from "./auth.ts";

export type SongAcceptanceObservation = Readonly<{
  readonly lyricsRequestCount: number;
  readonly instrumentalReviewVisible: boolean;
  readonly submissionId: string;
}>;

export async function publishSongAndVerifyPlayback(
  page: Page,
  marker: string,
  audioFixture: Buffer,
  lyrics = "",
  testInfo: TestInfo = test.info(),
  onObservation?: (observation: SongAcceptanceObservation) => void,
): Promise<void> {
  /** Every publication of this submission, to prove there is exactly one. */
  const publications: string[] = [];
  const lyricsCommands: string[] = [];
  let lyricsRequestCount = 0;
  let instrumentalReviewVisible = false;
  const requestListener = (request: Request) => {
    if (request.method() === "POST"
      && /\/media-post-submissions\/[^/]+\/lyrics$/u.test(new URL(request.url()).pathname)) lyricsRequestCount++;
  };
  const responseListener = (response: Response) => {
    const path = new URL(response.url()).pathname;
    if (response.request().method() !== "POST" || !response.ok()) return;
    if (/\/media-post-submissions\/[^/]+\/terms$/u.test(path)) publications.push(path);
    if (/\/media-post-submissions\/[^/]+\/lyrics$/u.test(path)) lyricsCommands.push(path);
  };
  page.on("request", requestListener);
  page.on("response", responseListener);

  try {
    await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached" });
  await page.getByRole("button", { name: "Post", exact: true }).click();

  // Post opens the text composer beside the feed. Its song action takes the
  // audio file, and the song steps open in their own form.
  let composer = page.getByRole("form", { name: "Create a post" });
  await expect(composer).toBeVisible();

  // Choosing a song is choosing the audio; the wizard follows the file.
  const storedPromise = page.waitForResponse(response =>
    response.request().method() === "PUT" && response.status() < 400,
    { timeout: 120_000 });
  void storedPromise.catch(() => {}); // The later await still reports failure; avoid an unhandled rejection if UI steps fail first.
  await composer.locator('input[aria-label="Choose a song file"]').first().setInputFiles({
    name: `${marker}.mp3`,
    mimeType: "audio/mpeg",
    buffer: audioFixture,
  });
  composer = page.getByRole("form", { name: "Post a song" });
  // The song steps have no stepper; each step is named by its heading.
  await expect(composer.getByRole("heading", { name: "Song", exact: true })).toBeVisible();

  const title = composer.getByLabel("Song title", { exact: false });
  if (await title.count() > 0) await title.fill(marker);

  if (lyrics !== "") {
    await composer.getByLabel("Lyrics (optional)", { exact: true }).fill(lyrics);
  }

  // Song, Royalties, Review. Each advance waits for the exact next step's
  // heading; unrelated status copy changing cannot satisfy the assertion.
  // Lyrics are entered on the Song step and bound when the song is published.
  const forward = composer.locator("[data-composer-forward]");
  const stepHeading = (name: string) => composer.getByRole("heading", { name, exact: true });

  await expect(forward).toBeEnabled({ timeout: 120_000 });
  await forward.click();
  await expect(stepHeading("Royalties")).toBeVisible({ timeout: 120_000 });
  await expect(forward).toBeEnabled({ timeout: 120_000 });
  await forward.click();
  await expect(stepHeading("Review")).toBeVisible({ timeout: 120_000 });

  // The audio reached the real object store before anything was published.
  expect((await storedPromise).status()).toBeLessThan(400);

  const review = await composer.innerText();
  // The Review step states a song without lyrics as "No lyrics added".
  instrumentalReviewVisible = review.includes("No lyrics added");
  if (lyrics === "") {
    expect(review).toContain("No lyrics added");
    expect(lyricsRequestCount).toBe(0);
  }
  else expect(review).not.toContain("No lyrics added");

  await composer.getByRole("button", { name: "Post song" }).click();
  // The steps end when the server accepts the song. It is then in the feed,
  // naming the stage it is on, until the published song takes its place.
  await expect(composer).toBeHidden({ timeout: 180_000 });
  const own = page.locator("[data-pending-song]").filter({ has: page.getByText(marker, { exact: false }) });
  const publishedPost = page.locator("[data-community-post]").filter({ has: page.getByText(marker, { exact: false }) });
  await expect(own.or(publishedPost).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Check status")).toHaveCount(0);
  await expect.poll(async () => {
    if (await publishedPost.count() > 0) return "published";
    return await own.first().getAttribute("data-pending-song-status").catch(() => null);
  }, { timeout: 420_000, intervals: [2_000] }).toBe("published");

  expect(publications).toHaveLength(1);
  expect(lyricsCommands).toHaveLength(lyrics === "" ? 0 : 1);
  const submissionId = publications[0]?.match(/^\/api\/media-post-submissions\/([A-Za-z0-9_-]+)\/terms$/u)?.[1];
  if (!submissionId) throw new Error("Published song did not expose a bounded submission identifier.");
  onObservation?.({ lyricsRequestCount, instrumentalReviewVisible, submissionId });

  testInfo.annotations.push({
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
  } finally {
    page.off("request", requestListener);
    page.off("response", responseListener);
  }
}

/** Read the persisted submission through the generated API contract and keep only bounded enums. */
export async function assertPersistedInstrumentalSong(page: Page, submissionId: string): Promise<"no_lyrics"> {
  type SubmissionResponse = Awaited<ReturnType<PirateApiClient["get_mediaPostSubmissionsSubmissionId"]>>;
  // The vendor client is TS-only and cannot be loaded by Playwright's Node
  // discovery loader. Keep this adapter typed to its generated method while
  // using the same-origin request context that shares the browser cookies.
  const response = await page.context().request.fetch(
    new URL(`/api/media-post-submissions/${encodeURIComponent(submissionId)}`, page.url()).toString(),
    { method: "GET", failOnStatusCode: false },
  );
  if (!response.ok()) throw new Error("Published song readback request was not successful.");
  const snapshot = await response.json() as SubmissionResponse;
  if (snapshot.track !== "song" || snapshot.status !== "published") {
    throw new Error("Published song readback did not return the published song contract.");
  }
  if (snapshot.lyrics_state.current.status !== "no_lyrics") {
    throw new Error("Published instrumental song readback did not persist no_lyrics.");
  }
  return "no_lyrics";
}
