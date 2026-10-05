// Local-only built Worker + browser regression; all API traffic terminates at the fixture.
// Build first: SOLID_API_NEXT_FIXTURE_ORIGIN=http://127.0.0.1:8796 bun run build
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { chromium } from "playwright";

const apiPort = 8796;
const solidPort = 4189;
const origin = `http://127.0.0.1:${solidPort}`;
const media = "/storybook/karaoke-artwork.svg";
const profile = {
  id: "owned", object: "profile", display_name: "Owned profile",
  avatar_ref: media, avatar_source: "upload", cover_ref: media, cover_source: "upload",
  bio: "Public biography", bio_source: "manual", preferred_locale: "en",
  global_handle: { id: "handle-owned", object: "global_handle", label: "owned.pirate", status: "active" },
  created: 1700000000,
};
let authenticated = false;
const publicCalls = [];
const credentialLeaks = [];
const activityCalls = [];
const upstream = createServer((request, response) => {
  const path = new URL(request.url, "http://fixture").pathname;
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify(body));
  };
  if (path.startsWith("/public-")) {
    publicCalls.push(path);
    if (request.headers.cookie || request.headers.authorization) credentialLeaks.push(path);
  }
  if (path === "/public-profiles/owned") return send(200, {
    profile, requested_handle_label: "owned.pirate", resolved_handle_label: "owned.pirate",
    is_canonical: true, created_communities: [{ community: "community-owned", display_name: "Harbor", created: 1700000001, route_slug: "harbor" }],
  });
  if (path === "/public-personas/owned") return send(200, {
    persona: { persona_id: "owned", object: "persona", display_name: "owned.pirate", avatar_ref: media, primary_public_handle: "owned.pirate" },
    profile: { revision: 1, cover_ref: media, bio: "Public biography" }, handle_grants: [],
  });
  if (path === "/users/me" && authenticated) return send(200, {
    id: "user-owned", object: "user", verification_state: "unverified", created: 1700000000,
    verification_capabilities: Object.fromEntries(["unique_human", "age_over_18", "minimum_age", "nationality", "gender", "wallet_score"].map(key => [key, { state: "unverified" }])),
  });
  if (path === "/personas" && authenticated) return send(200, { personas: [{
    persona_id: "owned", object: "persona", status: "active",
    profile: { persona_id: "owned", object: "persona_profile", revision: 1, display_name: "Owned profile", avatar_ref: media, cover_ref: media, bio: "Public biography", preferred_locale: "en", primary_public_handle: "owned.pirate" },
    wallet_set: { evm: null }, community_binding: null, created_at: "2026-09-01T00:00:00Z", retired_at: null,
  }] });
  if (path === "/community-memberships" && authenticated) return send(200, { items: [], next_cursor: null });
  if (path === "/public/communities/popular") return send(200, { object: "popular_community_list", ranked_by: "members", items: [] });
  if (path === "/users/me/moderation-communities" && authenticated) return send(200, { object: "moderation_community_page", capability: "moderation.view", items: [], next_cursor: null });
  if (path === "/public/personas/owned/activity") {
    activityCalls.push({ authenticated, path });
    return send(200, { object: "profile_activity_page", next_cursor: null, items: authenticated ? [{
      kind: "comment", activity_id: "member-comment", activity_at: "2026-10-05T11:00:00.000000Z", community_id: "member-community", community_name: "Member community", post_id: "member-post", post_title: "Member post", href: "/posts/member-post",
      comment: { comment_id: "member-comment", parent_comment_id: null, body: "Viewer-readable activity fixture", author_persona: { persona_id: "owned", object: "persona", display_name: "Owned profile", avatar_ref: media, primary_public_handle: "owned.pirate" }, depth: 0, reply_count: 0, status: "published", content_rating: "general", created_at: "2026-10-05T11:00:00Z" },
    }] : [] });
  }
  return send(path === "/users/me" ? 401 : 404, { error: { code: path === "/users/me" ? "auth_error" : "not_found", message: "Fixture response", retryable: false } });
});
const assert = (condition, message) => { if (!condition) throw new Error(message); };
let worker;
let browser;
let workerLog = "";
let spawnError;
try {
  await new Promise((resolve, reject) => { upstream.once("error", reject); upstream.listen(apiPort, "127.0.0.1", resolve); });
  worker = spawn("bun", ["x", "vite", "preview", "--host", "127.0.0.1", "--port", String(solidPort), "--strictPort"], {
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
  for (authenticated of [false, true]) {
    for (const route of ["/u/owned.pirate", "/p/owned"]) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        const failures = [];
        page.on("pageerror", error => failures.push(error.message));
        page.on("console", message => {
          if (/hydration.*(mismatch|fail|unclaimed)|reactivity_halted|reactive_write_in_owned_scope/i.test(message.text())) failures.push(message.text());
        });
        await page.addInitScript(() => {
          const observer = new MutationObserver(() => {
            const heading = document.querySelector("[data-profile-layout] h1");
            if (heading && !window.initialProfileHeading) { window.initialProfileHeading = heading; observer.disconnect(); }
          });
          observer.observe(document, { subtree: true, childList: true });
        });
        const result = await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded" });
        assert(result?.status() === 200, `${route}: successful SSR response required`);
        const html = await result.text();
        assert(html.includes("Public biography") && html.includes(media), `${route}: public response missing from SSR`);
        assert(!html.includes('href="/settings"'), `${route}: private action leaked into SSR`);
        assert(!html.includes("Viewer-readable activity fixture"), `${route}: viewer activity leaked into SSR`);
        try {
          await page.locator("#app-root[data-hydrated='true']").waitFor({ timeout: 30000 });
        } catch (error) {
          throw new Error(`${route}: hydration did not settle: ${failures.join("; ")}`, { cause: error });
        }
        await page.locator(`[data-shell-auth='${authenticated ? "authenticated" : "anonymous"}']`).waitFor();
        const settings = page.locator("[data-profile-layout]").getByRole("link", { name: "Settings", exact: true });
        if (authenticated) await settings.waitFor({ state: "visible" });
        else assert(await settings.count() === 0, `${route}: visitor settings`);
        assert(await page.evaluate(() => window.initialProfileHeading === document.querySelector("[data-profile-layout] h1")), `${route}: hydration replaced the SSR hero`);
        assert(await page.getByRole("tab").count() === 3, `${route}: activity tabs missing`);
        if (authenticated) await page.getByText("Viewer-readable activity fixture").waitFor();
        else await page.getByText("No activity to show.").waitFor();
        await page.getByRole("tab", { name: "Comments", exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[role="tab"][aria-label="Comments"]')?.getAttribute("aria-selected") === "true");
        assert(await page.evaluate(() => window.location.hash) === "#comments", `${route}: tab hash missing`);
        if (route === "/p/owned") assert(await page.locator("[data-profile-handle]").count() === 0, "Duplicate persona handle");
        await page.waitForFunction(() => {
          const heroImages = [...document.querySelectorAll('[data-profile-layout] > section[aria-label="Profile"] img')];
          return heroImages.length === 2 && heroImages.every(image => image.complete && image.naturalWidth > 0);
        });
        assert(failures.length === 0, `${route}: ${failures.join("; ")}`);
      } finally { await context.close(); }
    }
  }
  assert(publicCalls.length === 4, `Expected four server reads, received ${publicCalls.length}`);
  assert(credentialLeaks.length === 0, "Public profile forwarded private credentials");
  assert(activityCalls.length >= 8, "Hydrated activity and Comments reads missing");
  console.log(JSON.stringify({ ok: true, routes: ["/u/owned.pirate", "/p/owned"], viewers: ["anonymous", "owner"], successfulPublicReads: publicCalls.length, activityReads: activityCalls.length, privateActivityInSsr: false, hydrationErrors: 0 }));
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
