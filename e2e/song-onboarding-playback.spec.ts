import { expect, test } from "./fixtures/auth.ts";

const communityPath = process.env.E2E_RESUME_COMMUNITY_PATH?.trim() ?? "";
const marker = process.env.E2E_RESUME_SONG_MARKER?.trim() ?? "";

test.describe("Existing published song resumes playback", { tag: "@song-playback-resume" }, () => {
  test.setTimeout(600_000);
  test.beforeAll(() => {
    if (!communityPath || !marker) {
      throw new Error("E2E_RESUME_COMMUNITY_PATH and E2E_RESUME_SONG_MARKER are required.");
    }
    const target = new URL(process.env.E2E_BASE_URL?.trim() || "https://web-next-staging.pirate.sc");
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
    const staging = target.origin === "https://web-next-staging.pirate.sc";
    if ((!local && !staging) || !["http:", "https:"].includes(target.protocol)) {
      throw new Error("Resume playback requires the known staging origin or a prepared localhost origin; production is refused.");
    }
  });

  test("reloads the feed and plays and seeks the existing song", async ({ page }) => {
    await page.goto(communityPath);
    await page.reload();
    await expect(page.locator("#app-root[data-hydrated='true']").first()).toBeAttached({ timeout: 120_000 });
    await expect(page.getByText(marker, { exact: false }).first()).toBeVisible({ timeout: 120_000 });

    const song = page.locator("[data-community-post]").filter({ has: page.getByText(marker, { exact: false }) });
    await expect(song).toHaveCount(1);
    await song.getByRole("button", { name: `Play ${marker}`, exact: true }).click();
    const audio = song.locator("audio");
    await expect(audio).toBeVisible();

    const playbackState = () => audio.evaluate(element => {
      if (!(element instanceof HTMLAudioElement)) throw new Error("Expected audio player");
      return {
        duration: element.duration,
        currentTime: element.currentTime,
        seeking: element.seeking,
        error: element.error?.code ?? null,
      };
    });
    await expect.poll(async () => {
      const state = await playbackState();
      return Number.isFinite(state.duration) && state.duration > 0;
    }).toBe(true);
    await audio.evaluate(element => (element as HTMLAudioElement).play());
    await expect.poll(async () => (await playbackState()).currentTime).toBeGreaterThan(0);
    await audio.evaluate(element => {
      const player = element as HTMLAudioElement;
      player.pause();
      player.currentTime = player.duration / 2;
    });
    await expect.poll(async () => {
      const state = await playbackState();
      return state.seeking ? Infinity : Math.abs(state.currentTime - state.duration / 2);
    }).toBeLessThan(0.1);
    expect((await playbackState()).error).toBeNull();
  });
});
