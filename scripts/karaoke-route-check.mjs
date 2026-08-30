import { chromium } from "playwright";

const base = process.env.SOLID_BASE_URL ?? "http://localhost:4173";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});

const postDetail = {
  post: {
    id: "pst_test",
    object: "post",
    community: "com_test",
    authorship_mode: "human_direct",
    identity_mode: "public",
    post_type: "song",
    status: "published",
    visibility: "public",
    analysis_state: "allow",
    content_safety_state: "safe",
    age_gate_policy: "none",
    created: 1,
  },
  thread_snapshot: null,
  upvote_count: 0,
  downvote_count: 0,
  like_count: 0,
  viewer_vote: null,
  viewer_reaction_kinds: [],
  resolved_locale: "en",
  translation_state: "same_language",
  machine_translated: false,
  source_hash: null,
};

const payload = {
  state: "ready",
  object: "song_karaoke_payload",
  post_id: "pst_test",
  community_id: "com_test",
  title: "Hydration Song",
  karaoke_revision_id: "rev-1",
  playback_audio: { kind: "full_mix", ref: "/assets/hydration-song.wav" },
  playback_kind: "full_mix",
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
  await page.route("**/api/posts/pst_test", route => route.fulfill({ json: postDetail }));
  await page.route("**/api/communities/com_test/posts/pst_test/karaoke", route => route.fulfill({ json: payload }));
  await page.route("**/communities/com_test/posts/pst_test/karaoke/leaderboard**", route => route.fulfill({ json: leaderboard }));
  await page.route("**/assets/hydration-song.wav", route => route.fulfill({
    body: Buffer.from("UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=", "base64"),
    contentType: "audio/wav",
  }));

  const sessionResponse = await page.goto(`${base}/p/pst_test/karaoke`, { waitUntil: "networkidle" });
  if (!sessionResponse?.ok()) throw new Error(`session route returned ${sessionResponse?.status()}`);
  await page.waitForTimeout(1000);
  if (await page.locator('section[aria-label="Hydration Song"]').count() === 0) {
    throw new Error(`session did not load; requests=${requests.join(",")}; errors=${errors.join(" | ")}; body=${(await page.locator("body").innerText()).slice(0, 300)}`);
  }
  if (await page.title() !== "Hydration Song · Karaoke") throw new Error(`session title did not hydrate; title=${await page.title()}`);
  await page.locator('section[aria-label="Hydration Song"]').waitFor();
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
