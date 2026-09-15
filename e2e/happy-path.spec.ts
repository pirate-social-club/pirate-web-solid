import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { expect, test, type BrowserContext, type Page, type TestInfo } from "playwright/test";

import { createCommunityAndVerifyAcceptance } from "./fixtures/create-community.ts";
import { e2eBaseURL } from "./fixtures/environment.ts";
import {
  registerFreshAccountOnPage,
  signInExistingAccountOnPage,
} from "./fixtures/fresh-registration.ts";
import { happyPathAttemptContext } from "./fixtures/happy-path-preflight.ts";
import { HappyPathReceipt, observeHappyPathPage } from "./fixtures/happy-path-receipt.ts";
import { captureSanitizedNetworkDiagnostics, type SanitizedNetworkDiagnostics } from "./fixtures/diagnostics.ts";
import { assertPersistedInstrumentalSong, publishSongAndVerifyPlayback } from "./fixtures/publish-song.ts";

const audioFixture = await readFile(new URL("./fixtures/song-instrumental.mp3", import.meta.url));

async function publishTextPost(
  page: Page,
  communityPath: string,
  marker: string,
  testInfo: TestInfo,
): Promise<void> {
  await page.goto(communityPath);
  await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached" });
  const postHere = page.getByRole("button", { name: "Post" });
  await expect(postHere).toBeVisible();
  await postHere.click();

  const composer = page.getByRole("form", { name: "Create a post" });
  await expect(composer).toBeVisible();
  await expect(composer.getByRole("textbox", { name: "Community ID" })).toHaveCount(0);
  await composer.getByLabel("Title", { exact: true }).fill(marker);
  await composer.getByLabel("Description", { exact: true }).fill(marker);

  const published = page.waitForResponse(response => response.request().method() === "POST"
    && /\/api\/communities\/[^/]+\/posts$/u.test(new URL(response.url()).pathname));
  await composer.getByRole("button", { name: "Publish post", exact: true }).click();
  expect((await published).status()).toBe(201);
  await expect(composer).toBeHidden();

  testInfo.annotations.push({
    type: "cleanup-required",
    description: `No post-delete contract exists; staging text is identifiable by marker ${marker}`,
  });
  await page.reload();
  await expect(page.getByText(marker, { exact: true }).first()).toBeVisible();
  await expect(page.locator("[data-community-post]").filter({ has: page.getByText(marker, { exact: true }) })).toHaveCount(1);
}

test.use({ trace: "off", screenshot: "off", video: "off" });

async function receiptStep<T>(
  receipt: HappyPathReceipt,
  testInfo: TestInfo,
  name: string,
  operation: () => Promise<T>,
): Promise<T> {
  receipt.beginStep(name);
  try {
    const result = await operation();
    receipt.finishStep(name, "passed");
    return result;
  } catch (error) {
    receipt.finishStep(name, "failed");
    throw error;
  } finally {
    await receipt.persist(testInfo);
  }
}

test.describe("M1 D3 happy path", { tag: ["@happy-path", "@staging-mutating"] }, () => {
  test.setTimeout(900_000);

  test("registers, creates, posts text, publishes a song, and plays it", async ({ browser }, testInfo) => {
    const attempt = happyPathAttemptContext();
    testInfo.annotations.push(
      { type: "staging-serving-pair", description: attempt.releaseReference },
      { type: "happy-path-attempt", description: `${attempt.id} (${attempt.role})` },
    );
    const receipt = new HappyPathReceipt(
      { id: attempt.id, number: attempt.number, role: attempt.role, started_at: attempt.startedAt },
      attempt.releaseReference,
      attempt.manifestDigest,
      attempt.manifestObservedAt,
      attempt.playbackHost,
      audioFixture,
    );
    const detachObservers: Array<() => void> = [];
    const diagnostics: SanitizedNetworkDiagnostics[] = [];
    let context: BrowserContext | null = null;
    let page!: Page;
    let outcome: "passed" | "failed" = "failed";
    const marker = (kind: string) => `E2E ${attempt.id} ${kind} ${crypto.randomUUID().slice(0, 8)}`;
    try {
      await receipt.persist(testInfo);
      context = await browser.newContext({ baseURL: new URL(e2eBaseURL()).origin });
      page = await context.newPage();
      detachObservers.push(observeHappyPathPage(page, receipt));
      diagnostics.push(captureSanitizedNetworkDiagnostics(page));
      await receiptStep(receipt, testInfo, "registration", async () => {
        const observation = await registerFreshAccountOnPage(page);
        expect(observation.exchangeStatuses).toEqual([401, 200]);
        expect(observation.registerStatuses).toEqual([201]);
        expect(observation.registrationAttestationValid).toBe(true);
      });

      await context.close();
      context = await browser.newContext({ baseURL: new URL(e2eBaseURL()).origin });
      page = await context.newPage();
      detachObservers.push(observeHappyPathPage(page, receipt));
      diagnostics.push(captureSanitizedNetworkDiagnostics(page));
      await receiptStep(receipt, testInfo, "relogin", async () => {
        const observation = await signInExistingAccountOnPage(page);
        expect(observation.exchangeStatuses).toEqual([200]);
        expect(observation.registerStatuses).toEqual([]);
      });

      const communityMarker = marker("community");
      const communityPath = await receiptStep(receipt, testInfo, "community", async () => {
        const path = await createCommunityAndVerifyAcceptance(page, communityMarker, testInfo, observation => {
          receipt.recordResourceId("community_id", observation.communityId);
        });
        await page.reload();
        await expect(page.locator("[data-community-state='success']")).toBeVisible();
        await expect(page.getByRole("heading", { name: communityMarker, exact: true })).toBeVisible();
        return path;
      });

      const textMarker = marker("text-post");
      await receiptStep(receipt, testInfo, "text_post", () => publishTextPost(page, communityPath, textMarker, testInfo));

      const songMarker = marker("song");
      await receiptStep(receipt, testInfo, "song", async () => {
        await page.goto(communityPath);
        await publishSongAndVerifyPlayback(page, songMarker, audioFixture, "", testInfo, observation => {
          receipt.recordSongObservation(observation);
          receipt.recordResourceId("song_submission_id", observation.submissionId);
        });
        const snapshot = receipt.snapshot();
        expect(snapshot.lyrics.request_count).toBe(0);
        expect(snapshot.lyrics.instrumental_review_visible).toBe(true);
        const submissionId = snapshot.resources.song_submission_id;
        if (!submissionId) throw new Error("Published song did not produce a bounded submission identifier.");
        expect(await assertPersistedInstrumentalSong(page, submissionId)).toBe("no_lyrics");
        receipt.recordPersistedNoLyrics();
        await expect.poll(() => receipt.signedAudioEvidence()?.rangeStatus ?? null, {
          timeout: 120_000,
          message: "Song playback must produce an observed ranged audio response",
        }).toBe(206);
        const audio = receipt.signedAudioEvidence();
        expect(audio).not.toBeNull();
        if (!audio) throw new Error("Signed audio evidence was not captured");
        expect(audio.hostname).toBe(attempt.playbackHost);
        expect(audio.requestHadRange).toBe(true);
        expect(audio.contentType).toMatch(/^audio\//u);
        expect(audio.contentRange).toMatch(/^bytes \d+-\d+\/(?:\d+|\*)$/u);
        expect(audio.cspHostMatch).toBe(true);
      });
      outcome = "passed";
    } finally {
      for (const detach of detachObservers) detach();
      await receipt.flushResponseReads();
      await Promise.all(diagnostics.map(diagnostic => diagnostic.stop()));
      if (outcome === "failed") {
        const path = testInfo.outputPath("sanitized-network-events.json");
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, JSON.stringify({ contexts: diagnostics.map(diagnostic => JSON.parse(diagnostic.summary())) }, null, 2), "utf8");
        await testInfo.attach("sanitized-network-events", { path, contentType: "application/json" });
      }
      try {
        if (context) await context.close();
      } finally {
        receipt.finalize(outcome);
        await receipt.attach(testInfo);
      }
    }
  });
});
