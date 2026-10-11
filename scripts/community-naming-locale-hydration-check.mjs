// Local Worker/browser regression only. Every API response is an explicit fixture.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { offering, communityId, personaId, label, confirmation, quote, reservation, claim } from "../src/features/communities/community-join-name/community-name-test-fixtures.ts";

const apiPort = 8794;
const solidPort = 4189;
const origin = `http://127.0.0.1:${solidPort}`;
const preview = { id: communityId, object: "community_preview", display_name: "Locale fixture", membership_mode: "open", human_verification_lane: null,
  moderators: [], membership_gate_summaries: [], rules: [], created: 1, viewer_membership_status: "member", viewer_following: false, follower_count: 0 };
const mutations = [];
const fixtureReads = new Set();
const publicCredentialLeaks = [];
let releaseConfirmation;
let fixtureMode = "expiry";
let claimReads = 0;
const upstream = createServer((request, response) => {
  const path = new URL(request.url, "http://fixture").pathname;
  if (request.method === "GET") fixtureReads.add(path);
  const send = (status, body) => { response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify(body)); };
  if (request.method === "POST") {
    mutations.push({ path, csrf: request.headers["x-csrf-token"] === "fixture-csrf" });
    if (path === "/handle-persona-link-confirmations") { releaseConfirmation = () => send(200, confirmation); return; }
    if (path === "/handle-quotes") return send(200, quote);
    if (path === "/handle-reservations") return send(200, reservation);
    if (path === "/handle-claims") return fixtureMode === "pending"
      ? send(200, { claim: claim("issuance_pending"), replayed: false })
      : send(409, { error: { code: "conflict", message: "Fixture expiry", retryable: false, details: { reason: "reservation_expired" } } });
  }
  if (path === "/handle-claims/claim-1") { claimReads += 1; return send(200, claim("issuance_pending")); }
  if (path === "/c/charizard") return send(200, { community_id: communityId, canonical_route: {
    family: "hns", root_label: "charizard", root_label_display: "charizard", path_segment: "charizard", href: "/c/charizard", app_host: "app.charizard" } });
  if (path === `/communities/${communityId}/preview`) return send(200, preview);
  if (path === "/users/me") return send(200, { id: "locale-fixture-account", object: "user", verification_state: "unverified", created: 1,
    verification_capabilities: Object.fromEntries(["unique_human", "age_over_18", "minimum_age", "nationality", "gender", "wallet_score"].map(key => [key, { state: "unverified" }])) });
  if (path === "/personas") return send(200, { personas: [{ persona_id: personaId, object: "persona", status: "active", community_binding: { community_id: communityId, binding_source: "first_membership" },
    profile: { persona_id: personaId, object: "persona_profile", revision: 1, display_name: "Member", avatar_ref: null, cover_ref: null, bio: null, preferred_locale: null, primary_public_handle: null },
    wallet_set: { evm: null }, created_at: "2026-10-10T00:00:00.000Z", retired_at: null }] });
  if (path === `/public-communities/${communityId}/feed`) return send(200, { community: preview, items: [], next_cursor: null });
  if (path === `/communities/${communityId}/handle-offerings` || path === `/personas/${personaId}/handle-grants`) {
    if (request.headers.cookie || request.headers.authorization || request.headers["x-csrf-token"]) publicCredentialLeaks.push(path);
    return send(200, { items: path.endsWith("handle-offerings") ? [offering] : [], next_cursor: null });
  }
  return send(404, { error: { code: "not_found", message: "Not in local fixture", retryable: false } });
});
const assert = (condition, message) => { if (!condition) throw new Error(message); };
let worker;
let browser;
let workerLog = "";
let spawnError;
const results = [];
try {
  await new Promise((resolve, reject) => { upstream.once("error", reject); upstream.listen(apiPort, "127.0.0.1", resolve); });
  worker = spawn("bun", ["x", "vite", "dev", "--host", "127.0.0.1", "--port", String(solidPort), "--strictPort"], {
    cwd: new URL("..", import.meta.url), env: { ...process.env, NO_COLOR: "1", SOLID_API_NEXT_FIXTURE_ORIGIN: `http://127.0.0.1:${apiPort}` }, stdio: ["ignore", "pipe", "pipe"] });
  worker.once("error", error => { spawnError = error; });
  const append = chunk => { workerLog = (workerLog + chunk.toString()).slice(-64 * 1024); };
  worker.stdout.on("data", append); worker.stderr.on("data", append);
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (spawnError) throw spawnError;
    if (worker.exitCode !== null) throw new Error("Local Worker exited before readiness");
    try { await fetch(`${origin}/favicon.ico`, { signal: AbortSignal.timeout(1000) }); ready = true; break; } catch { /* bounded startup */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, "Local Worker did not become ready");
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  for (const locale of ["ar", "zh"]) {
    const { communityJoinName: copy } = JSON.parse(await readFile(new URL(`../src/locales/${locale}/routes.json`, import.meta.url), "utf8"));
    for (const mobile of [false, true]) {
      mutations.length = 0;
      releaseConfirmation = undefined;
      const context = await browser.newContext({ bypassCSP: true, locale: "en-US", extraHTTPHeaders: { "accept-language": locale }, viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 } });
      try {
        // Browser-only CSRF fixture; no real session or provider credentials.
        await context.addCookies([{ name: "__Host-pirate_csrf", value: "fixture-csrf", domain: "127.0.0.1", path: "/", secure: true, sameSite: "Lax" }]);
        await context.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1"
          ? route.continue({ headers: { ...route.request().headers(), "accept-language": locale } })
          : route.abort());
        let page = await context.newPage();
        const failures = [];
        page.on("pageerror", error => failures.push(error.message));
        page.on("console", message => { if (/hydration.*(mismatch|fail)|reactivity_halted|reactive_write_in_owned_scope/i.test(message.text())) failures.push(message.text()); });
        const response = await page.goto(`${origin}/c/charizard`, { waitUntil: "domcontentloaded" });
        assert(response?.status() === 200, `${locale}: SSR status`);
        const language = locale === "zh" ? "zh-CN" : "ar";
        const html = await response.text();
        assert(html.includes(`lang="${language}"`), `${locale}: request locale absent from SSR document (${html.match(/<html[^>]*>/)?.[0]})`);
        await page.locator("#app-root[data-hydrated='true']").waitFor({ timeout: 30_000 });
        assert(await page.evaluate(() => navigator.language) === "en-US", "Browser language fixture was changed");
        assert(await page.locator("html").getAttribute("lang") === language, "Hydration changed request language");
        const menuControl = page.getByRole("button", { name: copy.profileMenu, exact: true });
        const menuElement = await menuControl.elementHandle();
        assert(menuElement !== null, "Profile menu disappeared before naming");
        const dialog = page.getByRole("dialog", { name: copy.title, exact: true });
        const openNaming = async () => {
          try { await menuControl.click({ timeout: 10_000 }); }
          catch (error) { console.error(JSON.stringify({ fixtureReads: [...fixtureReads], buttons: await page.getByRole("button").allTextContents(), buttonLabels: await page.getByRole("button").evaluateAll(elements => elements.map(element => element.getAttribute("aria-label"))) })); throw error; }
          const profiles = page.getByRole("dialog", { name: copy.profileTitle, exact: true });
          await profiles.getByRole("button", { name: copy.getNameEntry, exact: true }).click();
          await profiles.waitFor({ state: "hidden" });
          await dialog.waitFor();
        };
        await openNaming();
        await dialog.getByRole("textbox", { name: copy.label, exact: true }).fill(label);
        await dialog.getByRole("button", { name: copy.getName, exact: true }).click();
        await page.locator('[data-community-join-name-state="submitting"]').waitFor();
        await dialog.getByRole("textbox", { name: copy.label, exact: true }).evaluate(element => {
          if (!element.disabled) throw new Error("Submitting fixture did not disable the field");
        });
        // The primitive refreshes its focusable set after the disabled/tabindex mutation.
        await page.waitForTimeout(200);
        await page.waitForFunction(element => element.contains(document.activeElement), await dialog.elementHandle());
        for (const key of ["Tab", "Shift+Tab"]) for (let index = 0; index < 8; index += 1) {
          await page.keyboard.press(key);
          const focus = await dialog.evaluate(element => ({ inside: element.contains(document.activeElement), active: document.activeElement?.outerHTML,
            controls: [...element.querySelectorAll('input,button')].map(control => ({ tag: control.tagName, disabled: control.disabled, tabIndex: control.tabIndex })) }));
          assert(focus.inside, `${locale}: focus escaped submitting dialog ${JSON.stringify({ key, index, focus })}`);
        }
        assert(typeof releaseConfirmation === "function", "Confirmation fixture was not held");
        releaseConfirmation();
        await page.getByText(copy.requestExpired, { exact: true }).waitFor();
        // Allow the name sheet's focusable-set update to settle after the response.
        await page.waitForTimeout(500);
        assert(mutations.length === 4 && mutations.every(mutation => mutation.csrf), "Recovery fixture did not reach the four protected commands");
        for (const key of ["Tab", "Shift+Tab"]) for (let index = 0; index < 8; index += 1) {
          await page.keyboard.press(key);
          assert(await dialog.evaluate(element => element.contains(document.activeElement)), `${locale}: focus escaped name dialog`);
        }
        const background = await menuElement.evaluate(element => ({
          hiddenFromAssistiveTechnology: element.closest('[aria-hidden="true"]') !== null,
          pointerEvents: getComputedStyle(element).pointerEvents,
        }));
        assert(background.hiddenFromAssistiveTechnology && background.pointerEvents === "none", `${locale}: modal background remains interactive`);
        assert(failures.length === 0, `${locale}: ${failures.join("; ")}`);
        assert(publicCredentialLeaks.length === 0, "Public name reads forwarded private credentials");
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        await page.waitForTimeout(350);
        assert(await menuControl.evaluate(element => element === document.activeElement), `${locale}: closing naming did not return focus to the profile menu`);
        // Close a real browser tab while issuance is pending, then reopen the
        // same origin. Session storage is gone; command correlation must remain.
        mutations.length = 0; fixtureMode = "pending"; releaseConfirmation = undefined;
        await openNaming();
        await dialog.getByRole("textbox", { name: copy.label, exact: true }).fill(label);
        await dialog.getByRole("button", { name: copy.getName, exact: true }).click();
        for (let attempt = 0; attempt < 40 && releaseConfirmation === undefined; attempt += 1) await page.waitForTimeout(50);
        assert(typeof releaseConfirmation === "function", "Pending confirmation fixture did not arrive"); releaseConfirmation();
        const storageKey = `pirate:community-name:v1:locale-fixture-account:${encodeURIComponent(communityId)}`;
        await page.waitForFunction(key => JSON.parse(localStorage.getItem(key) ?? "null")?.claim?.claim?.claim_id === "claim-1", storageKey);
        const originalKeys = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).keys, storageKey);
        assert(mutations.length === 4, "Pending fixture did not reach all four commands");
        await page.close();
        page = await context.newPage();
        page.on("pageerror", error => failures.push(error.message));
        await page.goto(`${origin}/c/charizard`, { waitUntil: "domcontentloaded" });
        await page.locator("#app-root[data-hydrated='true']").waitFor({ timeout: 30_000 });
        assert(await page.evaluate(key => sessionStorage.getItem(key) === null, storageKey), "New tab inherited the old session storage");
        const restored = page.getByRole("dialog", { name: copy.title, exact: true });
        await page.locator('[data-community-join-name-state="pending"]').waitFor();
        assert(await restored.getByRole("textbox", { name: copy.label, exact: true }).inputValue() === label, "Closed-tab recovery lost its original name");
        assert(await restored.getByRole("textbox", { name: copy.label, exact: true }).isDisabled(), "Closed-tab recovery allowed a replacement name");
        await page.keyboard.press("Escape");
        await restored.waitFor({ state: "hidden" });
        await page.getByRole("button", { name: copy.profileMenu, exact: true }).click();
        const profiles = page.getByRole("dialog", { name: copy.profileTitle, exact: true });
        assert(await profiles.getByRole("button", { name: copy.getNameEntry, exact: true }).count() === 0, "Pending intent was offered as a new name");
        await profiles.getByRole("button", { name: copy.checkStatus, exact: true }).click();
        await profiles.waitFor({ state: "hidden" });
        await restored.waitFor();
        const readCount = claimReads;
        await restored.getByRole("button", { name: copy.checkStatus, exact: true }).click();
        for (let attempt = 0; attempt < 40 && claimReads === readCount; attempt += 1) await page.waitForTimeout(50);
        assert(claimReads > readCount && mutations.length === 4, "Closed-tab recovery repeated a command instead of reading its claim");
        assert(await page.evaluate(({ key, keys }) => JSON.stringify(JSON.parse(localStorage.getItem(key)).keys) === JSON.stringify(keys), { key: storageKey, keys: originalKeys }), "Closed-tab recovery replaced command keys");
        assert(failures.length === 0, `${locale}: ${failures.join("; ")}`);
        results.push({ locale, viewport: mobile ? "phone" : "desktop", hydrationErrors: 0, recoveryCopy: true, keyboardFocusTrapped: true, submittingFocusTrapped: true, backgroundHiddenAndPointerBlocked: true, focusRestored: true, profileMenuReentry: true, pendingStatusReentry: true, automaticInterruptedRecovery: true, closedTabRecovery: true, originalKeysRetained: true, noRepeatedCommands: true, publicCredentialLeaks: 0 });
      } finally { await context.close(); fixtureMode = "expiry"; }
    }
  }
  console.log(JSON.stringify({ ok: true, evidence: "local SSR/browser/API fixtures, no live authentication or device acceptance", results }));
} catch (error) {
  process.stderr.write(workerLog); throw error;
} finally {
  if (browser) await browser.close();
  if (worker && worker.exitCode === null) {
    const exited = once(worker, "exit"); worker.kill("SIGTERM");
    const force = setTimeout(() => worker.kill("SIGKILL"), 5000);
    await exited; clearTimeout(force);
  }
  if (upstream.listening) { upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); }
}
