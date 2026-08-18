import { chromium } from "playwright";

const base = process.env.SOLID_BASE_URL ?? "http://localhost:4173";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});

const payload = {
  id: "bundle-1",
  object: "song_karaoke_payload",
  post: "pst_test",
  community: "com_test",
  title: "Hydration Song",
  artist_name: "Test Artist",
  karaoke_lines: [{
    id: "line-1",
    index: 0,
    kind: "lyric",
    text: "Sing it back",
    start_ms: 0,
    end_ms: 2000,
    words: [{ text: "Sing", start_ms: 0, end_ms: 700 }],
  }],
};

const leaderboard = {
  object: "karaoke_song_leaderboard",
  post_id: "pst_test",
  community_id: "com_test",
  scope: "all_time",
  karaoke_revision_id: "rev-1",
  scoring_version: 1,
  scoring_provider: "openai",
  scoring_model: "test",
  total_ranked: 1,
  entries: [{
    rank: 1,
    top_percent: 100,
    score: 9300,
    reached_at: "2026-08-18T00:00:00.000Z",
    identity: { visibility: "visible", display_name: "Test Singer", handle: "singer", avatar_ref: null },
    is_viewer: false,
  }],
  viewer_rank: null,
  viewer_top_percent: null,
  viewer_best_score: null,
  viewer_best_reached_at: null,
  viewer_eligible_attempt_count: 0,
};

try {
  const page = await browser.newPage();
  const errors = [];
  const requests = [];
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("request", request => { if (request.url().includes("karaoke")) requests.push(request.url()); });
  await page.route("**/p/**", async route => {
    const response = await route.fetch();
    const headers = { ...response.headers(), "content-security-policy": "default-src 'self'; connect-src *; script-src 'nonce-" + (response.headers()["content-security-policy"]?.match(/nonce-([^']+)/)?.[1] ?? "") + "' 'strict-dynamic'; object-src 'none'; base-uri 'none'" };
    await route.fulfill({ response, headers });
  });
  await page.route("**/public-posts/pst_test/karaoke", route => route.fulfill({ json: payload }));
  await page.route("**/communities/com_test/posts/pst_test/karaoke/leaderboard**", route => route.fulfill({ json: leaderboard }));

  const sessionResponse = await page.goto(`${base}/p/pst_test/karaoke`, { waitUntil: "networkidle" });
  if (!sessionResponse?.ok()) throw new Error(`session route returned ${sessionResponse?.status()}`);
  await page.waitForTimeout(1000);
  if (await page.getByRole("heading", { name: "Hydration Song" }).count() === 0) {
    throw new Error(`session did not load; requests=${requests.join(",")}; errors=${errors.join(" | ")}; body=${(await page.locator("body").innerText()).slice(0, 300)}`);
  }
  await page.getByRole("heading", { name: "Hydration Song" }).waitFor();
  if (await page.getByLabel("Sing it back").count() === 0) throw new Error("session lyrics did not hydrate");

  const leaderboardResponse = await page.goto(`${base}/p/pst_test/karaoke/leaderboard`, { waitUntil: "networkidle" });
  if (!leaderboardResponse?.ok()) throw new Error(`leaderboard route returned ${leaderboardResponse?.status()}`);
  await page.getByRole("heading", { name: "Leaderboard" }).waitFor();
  if (await page.getByText("singer", { exact: true }).count() !== 1) throw new Error(`leaderboard did not hydrate; requests=${requests.join(",")}; errors=${errors.join(" | ")}; body=${(await page.locator("body").innerText()).slice(0, 300)}`);
  if (errors.length) throw new Error(`browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, routes: ["session", "leaderboard"], ssr: true, hydration: true }));
} finally {
  await browser.close();
}
