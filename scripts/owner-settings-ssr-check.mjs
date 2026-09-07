import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright";

// Run the built Worker locally on 4186 with API_NEXT_ORIGIN=http://127.0.0.1:4199.
// The upstream fixture receives real SSR/proxy requests, not browser interceptions.
const base = "http://127.0.0.1:4186";
const communityId = "community_midnight";
const routeView = { community_id: communityId, canonical_route: {
  family: "hns", root_label: "midnight", root_label_display: "midnight", path_segment: "midnight", href: "/c/midnight", app_host: "app.midnight",
} };
const preview = { id: communityId, object: "community_preview", display_name: "Midnight", membership_mode: "open", human_verification_lane: null, moderators: [], membership_gate_summaries: [], rules: [], created: 1700000000 };
const reads = [];
const upstream = createServer((request, response) => {
  const path = new URL(request.url, "http://127.0.0.1:4199").pathname;
  reads.push({ path, cookie: request.headers.cookie ?? null });
  const send = (body, status = 200) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body)); };
  if (request.method !== "GET") return send({ error: "writes forbidden" }, 405);
  if (path === "/c/midnight") return send(routeView);
  if (path.endsWith("/preview")) return send(preview);
  if (request.headers.cookie?.includes("unavailable")) return send({ error: { code: "upstream_unavailable", message: "Unavailable", retryable: true } }, 503);
  if (!request.headers.cookie?.includes("owner")) return send({ error: { code: "auth_error", message: "Sign in required", retryable: false } }, 401);
  if (path.endsWith("/me/capabilities")) return send({ community_id: communityId, role: "owner", role_assignment_id: "owner-1", capabilities: ["moderation.view", "moderation.act"] });
  // Names is intentionally unavailable so the browser must retain its retry entry.
  if (path.includes("/handle-sales-management")) return send({ error: { code: "upstream_unavailable", message: "Unavailable", retryable: true } }, 503);
  if (path.endsWith("/moderation/cases")) return send({ object: "community_moderation_case_list", community_id: communityId, view: "open", items: [] });
  return send({ error: { code: "auth_error", message: "Sign in required", retryable: false } }, 401);
});
await new Promise(resolve => upstream.listen(4199, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
try {
  for (const identity of ["owner", "unavailable", "anonymous"]) {
    const context = await browser.newContext();
    if (identity !== "anonymous") await context.addCookies([{ name: "__Host-pirate_session", value: identity, url: "https://127.0.0.1:4186", secure: true, sameSite: "Lax" }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const response = await page.goto(`${base}/c/midnight/settings/moderation_queue`);
    const html = await response.text();
    if (identity === "anonymous") {
      assert.equal(response.status(), 404);
      assert.match(html, /Owner access required/);
    } else {
      assert.equal(response.status(), 200);
      assert.match(html, /Owner settings sections/);
      await page.locator('nav[aria-label="Owner settings sections"]').waitFor();
      const nav = page.locator('nav[aria-label="Owner settings sections"]');
      assert.match(await nav.innerText(), /Names/);
      assert.match(await nav.innerText(), /Moderation queue/);
      if (identity === "unavailable") {
        assert.match(html, /Your access could not be determined/);
        assert.equal(new URL(page.url()).pathname, "/c/midnight/settings/moderation_queue");
      } else {
        await page.waitForFunction(() => document.body.textContent.includes("Nothing needs review"));
        assert.equal(await page.locator('[data-owner-settings-shell]').count(), 1);
      }
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  const publicReads = reads.filter(read => read.path === "/c/midnight" || read.path.endsWith("/preview"));
  assert(publicReads.length >= 6);
  assert(publicReads.every(read => read.cookie === null), JSON.stringify(publicReads));
  assert(reads.some(read => read.path.endsWith("/me/capabilities") && read.cookie?.includes("owner")));
  console.log(JSON.stringify({ ok: true, realSsrProxy: true, ownerQueue: true, allProbesUnavailable: true, signedOutDenied: true, publicReadsCredentialFree: true }));
} finally {
  await browser.close();
  await new Promise(resolve => upstream.close(resolve));
}
