import { readFile } from "node:fs/promises";
import { expect, test, type Page, type TestInfo } from "playwright/test";

import { createCommunityAndVerifyAcceptance } from "./fixtures/create-community.ts";
import { e2eBaseURL } from "./fixtures/environment.ts";
import {
  registerFreshAccountOnPage,
  signInExistingAccountOnPage,
} from "./fixtures/fresh-registration.ts";
import { stagingPairEvidence } from "./fixtures/happy-path-preflight.ts";
import { publishSongAndVerifyPlayback } from "./fixtures/publish-song.ts";

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

test.describe("M1 D3 happy path", { tag: ["@happy-path", "@staging-mutating"] }, () => {
  test.setTimeout(900_000);

  test("registers, creates, posts text, publishes a song, and plays it", async ({ browser }, testInfo) => {
    testInfo.annotations.push({ type: "staging-serving-pair", description: stagingPairEvidence() });
    let context = await browser.newContext({ baseURL: new URL(e2eBaseURL()).origin });
    let page = await context.newPage();
    try {
      await test.step("D0: register a fresh account and reload it", async () => {
        const observation = await registerFreshAccountOnPage(page);
        expect(observation.exchangeStatuses).toEqual([401, 200]);
        expect(observation.registerStatuses).toEqual([201]);
        expect(observation.registrationAttestationValid).toBe(true);
      });

      await context.close();
      context = await browser.newContext({ baseURL: new URL(e2eBaseURL()).origin });
      page = await context.newPage();
      await test.step("D0: re-login in a new browser context", async () => {
        const observation = await signInExistingAccountOnPage(page);
        expect(observation.exchangeStatuses).toEqual([200]);
        expect(observation.registerStatuses).toEqual([]);
      });

      const communityMarker = `E2E community ${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const communityPath = await test.step("D1: create a community and retain it after reload", async () => {
        const path = await createCommunityAndVerifyAcceptance(page, communityMarker, testInfo);
        await page.reload();
        await expect(page.locator("[data-community-state='success']")).toBeVisible();
        await expect(page.getByRole("heading", { name: communityMarker, exact: true })).toBeVisible();
        return path;
      });

      const textMarker = `E2E text post ${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      await test.step("D3: publish and reload a text post", () => publishTextPost(page, communityPath, textMarker, testInfo));

      const songMarker = `E2E song ${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      await test.step("D2: publish, reload, play and seek one song", async () => {
        await page.goto(communityPath);
        await publishSongAndVerifyPlayback(page, songMarker, audioFixture, "", testInfo);
      });
    } finally {
      await context.close();
    }
  });
});
