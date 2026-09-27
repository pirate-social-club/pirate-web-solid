// Local-only Worker + browser regression. All API traffic terminates at the fixture.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { chromium } from "playwright";

const apiPort = 8795;
const solidPort = 4188;
const origin = `http://127.0.0.1:${solidPort}`;
const communityId = "community_123e4567-e89b-42d3-a456-426614174000";
const preview = {
  id: communityId, object: "community_preview", display_name: "Feed fixture",
  membership_mode: "open", human_verification_lane: null, moderators: [],
  membership_gate_summaries: [], rules: [], created: 1_700_000_000,
};
const item = {
  post: {
    id: "post-hydration", object: "post", community: communityId,
    authorship_mode: "human_direct", identity_mode: "public", post_type: "text",
    status: "published", visibility: "public", analysis_state: "allow",
    content_safety_state: "safe", age_gate_policy: "none", created: 1_756_752_000,
    title: "Hydrated feed fixture", body: "Public content.",
  },
  thread_snapshot: null, upvote_count: 0, downvote_count: 0, like_count: 0,
  viewer_vote: null, viewer_reaction_kinds: [], resolved_locale: "en",
  translation_state: "ready", machine_translated: false, source_hash: null,
};
let scenario;
let feedCalls = 0;
const credentialLeaks = [];
const upstream = createServer((request, response) => {
  const path = new URL(request.url, "http://fixture").pathname;
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(body));
  };
  if (path.startsWith("/c/")) {
    const label = path.slice(3);
    return send(200, { community_id: communityId, canonical_route: {
      family: "hns", root_label: label, root_label_display: label, path_segment: label,
      href: `/c/${label}`, app_host: `app.${label}`,
    } });
  }
  if (path === `/communities/${communityId}/preview`) return send(200, preview);
  if (path === `/public-communities/${communityId}/feed`) {
    feedCalls += 1;
    if (request.headers.cookie || request.headers.authorization || request.headers["x-csrf-token"]) credentialLeaks.push(path);
    if (scenario === "failed" || (scenario === "recovered" && feedCalls === 1)) {
      return send(503, { error: { code: "provider_unavailable", message: "Fixture unavailable", retryable: true } });
    }
    return send(200, { community: preview, items: scenario === "empty" ? [] : [item], next_cursor: null });
  }
  return send(path === "/users/me" ? 401 : 404, {
    error: { code: path === "/users/me" ? "auth_error" : "not_found", message: "Anonymous fixture", retryable: false },
  });
});
const assert = (condition, message) => { if (!condition) throw new Error(message); };
let worker;
let browser;
let workerLog = "";
let spawnError;
try {
  await new Promise((resolve, reject) => { upstream.once("error", reject); upstream.listen(apiPort, "127.0.0.1", resolve); });
  worker = spawn("bun", ["x", "vite", "dev", "--host", "127.0.0.1", "--port", String(solidPort), "--strictPort"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, NO_COLOR: "1", SOLID_API_NEXT_FIXTURE_ORIGIN: `http://127.0.0.1:${apiPort}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  worker.once("error", error => { spawnError = error; });
  const append = chunk => { workerLog = (workerLog + chunk.toString()).slice(-64 * 1024); };
  worker.stdout.on("data", append);
  worker.stderr.on("data", append);
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (spawnError) throw spawnError;
    if (worker.exitCode !== null) throw new Error("Local Worker exited before readiness");
    try { await fetch(`${origin}/favicon.ico`, { signal: AbortSignal.timeout(1000) }); ready = true; break; } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, "Local Worker did not become ready");
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  for (scenario of ["empty", "ready", "recovered", "failed"]) {
    feedCalls = 0;
    // Vite's dev client is unnonced; production CSP has its separate gate.
    const context = await browser.newContext({ bypassCSP: true });
    try {
      const page = await context.newPage();
      const failures = [];
      const browserFeeds = [];
      const browserApiReads = [];
      page.on("pageerror", error => failures.push(error.message));
      page.on("console", message => {
        if (/hydration.*(mismatch|fail)|reactivity_halted|reactive_write_in_owned_scope/i.test(message.text())) failures.push(message.text());
      });
      page.on("request", request => {
        if (new URL(request.url()).pathname.startsWith("/api/")) browserApiReads.push(request.url());
        if (new URL(request.url()).pathname.endsWith("/feed")) browserFeeds.push(request.url());
      });
      const response = await page.goto(`${origin}/c/feed-${scenario}`, { waitUntil: "domcontentloaded" });
      assert(response?.status() === 200, `${scenario}: page status`);
      const html = await response.text();
      const failedServer = scenario === "recovered" || scenario === "failed";
      assert(html.includes("Community posts are temporarily unavailable") === failedServer, `${scenario}: wrong SSR state`);
      assert(!html.includes("Loading community posts"), `${scenario}: pending SSR feed`);
      await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached", timeout: 30_000 });
      const expected = scenario === "failed" ? "Community posts are temporarily unavailable"
        : scenario === "empty" ? "No posts in this community yet" : "Hydrated feed fixture";
      await page.getByText(expected, { exact: false }).first().waitFor({ state: "visible" });
      await page.waitForLoadState("networkidle");
      assert(browserFeeds.length === (failedServer ? 1 : 0), `${scenario}: browser reads ${browserFeeds.length}: ${JSON.stringify(browserApiReads)}`);
      assert(!browserApiReads.some(url => /\/api\/c\/|\/preview$/.test(new URL(url).pathname)), `${scenario}: route preflight was not adopted`);
      assert(feedCalls === (failedServer ? 2 : 1), `${scenario}: total reads ${feedCalls}`);
      assert(failures.length === 0, `${scenario}: ${failures.join("; ")}`);
      assert(credentialLeaks.length === 0, "Public feed forwarded credentials");
    } finally { await context.close(); }
  }
  console.log(JSON.stringify({ ok: true, scenarios: ["ready", "empty", "recovered", "failed"], hydrationErrors: 0, recoveryReads: 1 }));
} catch (error) {
  process.stderr.write(workerLog);
  throw error;
} finally {
  if (browser) await browser.close();
  if (worker && worker.exitCode === null) {
    const exited = once(worker, "exit");
    worker.kill("SIGTERM");
    const force = setTimeout(() => worker.kill("SIGKILL"), 5000);
    await exited;
    clearTimeout(force);
  }
  if (upstream.listening) { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); }
}
