import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { chromium } from "playwright";

const apiPort = 8789;
const solidPort = 4182;
const solidOrigin = `http://127.0.0.1:${solidPort}`;
const requests = [];
const lostAttempts = [];
const sessionRequests = [];
const communityIds = {
  "published": "community_123e4567-e89b-42d3-a456-426614174001",
  "manual-review": "community_123e4567-e89b-42d3-a456-426614174002",
  "blocked": "community_123e4567-e89b-42d3-a456-426614174003",
  "conflict": "community_123e4567-e89b-42d3-a456-426614174004",
  "lost-response": "community_123e4567-e89b-42d3-a456-426614174005",
};
const communitiesById = new Map(Object.entries(communityIds).map(([name, id]) => [id, name]));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function userFixture() {
  const unverified = { state: "unverified" };
  return {
    id: "user-text-e2e",
    object: "user",
    verification_state: "unverified",
    verification_capabilities: {
      unique_human: unverified,
      age_over_18: unverified,
      minimum_age: unverified,
      nationality: unverified,
      gender: unverified,
      wallet_score: unverified,
    },
    created: 1_777_000_000,
  };
}

function personasFixture() {
  return {
    personas: Object.entries(communityIds).map(([name, communityId]) => ({
      persona_id: `persona-text-${name}`,
      object: "persona",
      status: "active",
      profile: {
        persona_id: `persona-text-${name}`,
        object: "persona_profile",
        revision: 1,
        display_name: "Text fixture persona",
        avatar_ref: null,
        cover_ref: null,
        bio: null,
        preferred_locale: null,
        primary_public_handle: "text-fixture",
      },
      wallet_set: { evm: null },
      community_binding: { community_id: communityId, binding_source: "first_membership" },
      created_at: "2026-08-26T00:00:00.000Z",
      retired_at: null,
    })),
  };
}

function communityRouteFixture(communityId) {
  return {
    authority_version: "optional_route_v2",
    community_id: communityId,
    href: `/c/${communityId}`,
    canonical_route: null,
    persona_role_presentation: {
      role: "owner",
      persona: {
        persona_id: `persona-text-${communitiesById.get(communityId)}`,
        object: "persona",
        display_name: "Text fixture persona",
        avatar_ref: null,
        primary_public_handle: "text-fixture",
      },
    },
  };
}

function communityPreviewFixture(communityId) {
  return {
    id: communityId,
    object: "community_preview",
    display_name: "Text fixture community",
    description: "Contextual posting fixture.",
    membership_mode: "open",
    human_verification_lane: null,
    member_count: 1,
    follower_count: 1,
    viewer_membership_status: "member",
    viewer_following: true,
    moderators: [],
    membership_gate_summaries: [],
    rules: [],
    created: 1_777_000_000,
  };
}

function submission(status, community) {
  const base = {
    submission_id: `submission-${community}`,
    href: `/text-content-submissions/submission-${community}`,
    surface: "text_post",
    created_at: "2026-08-23T00:00:00.000Z",
    updated_at: "2026-08-23T00:00:00.000Z",
  };
  if (status === "published") return {
    ...base,
    status,
    result: { decision: "allow", reason_code: null },
    published_resource: { kind: "post", post_id: `post-${community}`, href: `/posts/post-${community}` },
    review_ref: null,
  };
  if (status === "manual_review") return {
    ...base,
    status,
    result: { decision: "manual_review", reason_code: "review_required" },
    published_resource: null,
    review_ref: `case-${community}`,
  };
  return {
    ...base,
    status: "blocked",
    result: { decision: "blocked", reason_code: "policy_violation" },
    published_resource: null,
    review_ref: null,
  };
}

const upstream = createServer(async (incoming, outgoing) => {
  try {
    const bodyText = await readBody(incoming);
    const pathname = new URL(incoming.url ?? "/", `http://127.0.0.1:${apiPort}`).pathname;
    if (pathname === "/health") {
      outgoing.writeHead(200, { "content-type": "application/json" });
      outgoing.end('{"ok":true}');
      return;
    }
    if (pathname === "/users/me") {
      sessionRequests.push({ path: pathname, method: incoming.method, cookie: incoming.headers.cookie });
      outgoing.writeHead(200, { "content-type": "application/json" });
      outgoing.end(JSON.stringify(userFixture()));
      return;
    }
    if (pathname === "/personas") {
      sessionRequests.push({ path: pathname, method: incoming.method, cookie: incoming.headers.cookie });
      outgoing.writeHead(200, { "content-type": "application/json" });
      outgoing.end(JSON.stringify(personasFixture()));
      return;
    }
    const communityRouteMatch = /^\/c\/(community_[^/]+)$/u.exec(pathname);
    if (incoming.method === "GET" && communityRouteMatch?.[1] !== undefined && communitiesById.has(communityRouteMatch[1])) {
      outgoing.writeHead(200, { "content-type": "application/json" });
      outgoing.end(JSON.stringify(communityRouteFixture(communityRouteMatch[1])));
      return;
    }
    const communityPreviewMatch = /^\/communities\/(community_[^/]+)\/preview$/u.exec(pathname);
    if (incoming.method === "GET" && communityPreviewMatch?.[1] !== undefined && communitiesById.has(communityPreviewMatch[1])) {
      outgoing.writeHead(200, { "content-type": "application/json" });
      outgoing.end(JSON.stringify(communityPreviewFixture(communityPreviewMatch[1])));
      return;
    }
    const match = /^\/communities\/([^/]+)\/posts$/u.exec(pathname);
    if (incoming.method === "POST" && match?.[1] !== undefined) {
      const communityId = decodeURIComponent(match[1]);
      const community = communitiesById.get(communityId);
      assert(community !== undefined, `unknown fixture community ${communityId}`);
      requests.push({
        community,
        bodyText,
        cookie: incoming.headers.cookie,
        csrf: incoming.headers["x-csrf-token"],
      });
      if (community === "lost-response") {
        lostAttempts.push(bodyText);
        if (lostAttempts.length === 1) {
          outgoing.destroy();
          return;
        }
      }
      if (community === "conflict") {
        outgoing.writeHead(409, { "content-type": "application/json", "x-request-id": "text-e2e" });
        outgoing.end(JSON.stringify({
          error: {
            code: "conflict",
            message: "Idempotency key is already bound",
            retryable: false,
            details: { reason_code: "idempotency_conflict", submission_id: "submission-conflict" },
          },
        }));
        return;
      }
      const status = community === "manual-review" ? "manual_review" : community === "blocked" ? "blocked" : "published";
      outgoing.writeHead(201, { "content-type": "application/json", "x-request-id": "text-e2e" });
      outgoing.end(JSON.stringify(submission(status, community)));
      return;
    }
    outgoing.writeHead(404, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ error: { code: "not_found", message: "fixture route not found", retryable: false } }));
  } catch (error) {
    outgoing.writeHead(500, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ error: String(error) }));
  }
});

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise(resolve => setTimeout(resolve, 5_000))]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

async function waitForWorker(child, readSpawnError) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Solid dev Worker exited with ${child.exitCode}`);
    const spawnError = readSpawnError();
    if (spawnError !== undefined) throw spawnError;
    try {
      const response = await fetch(`${solidOrigin}/api/health`);
      if (response.ok) return;
    } catch {
      // The Worker is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("Solid dev Worker did not become ready");
}

async function warmApplication() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(solidOrigin);
      const body = await response.text();
      if (response.ok && body.includes("app-root")) return;
    } catch {
      // Dependency optimization or SSR reload is still settling.
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Solid application did not become warm");
}

async function authenticatedPage(browser) {
  // Vite injects its development client without the production response nonce.
  // CSP itself is covered by hydration-check; this product-flow harness bypasses
  // that dev-only injection mismatch so it can exercise the hydrated composer.
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 900 } });
  await context.addCookies([
    { name: "pirate_session_fixture", value: "session-text-e2e", url: solidOrigin, httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", error => browserErrors.push(`pageerror:${error.message}`));
  page.on("console", message => { if (message.type() === "error") browserErrors.push(`console:${message.text()}`); });
  await page.goto(solidOrigin, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => { document.cookie = "__Host-pirate_csrf=csrf-text-e2e; Path=/; Secure; SameSite=Lax"; });
  assert((await page.evaluate(() => document.cookie)).includes("__Host-pirate_csrf=csrf-text-e2e"), "browser rejected the localhost CSRF cookie");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-home-session]").waitFor({ state: "attached" });
  for (let index = 0; index < 100; index += 1) {
    const current = await page.locator("[data-home-session]").getAttribute("data-home-session");
    if (current !== "resolving") break;
    await page.waitForTimeout(100);
  }
  const session = await page.locator("[data-home-session]").getAttribute("data-home-session");
  assert(session === "authenticated", `browser session resolved as ${session}; upstream calls: ${JSON.stringify(sessionRequests)}; errors: ${JSON.stringify(browserErrors)}`);
  return { context, page };
}

async function openComposer(page, community, body) {
  const communityId = communityIds[community];
  assert(communityId !== undefined, `missing fixture community id for ${community}`);
  const response = await page.goto(`${solidOrigin}/c/${communityId}`, { waitUntil: "domcontentloaded" });
  const html = await response.text();
  assert(html.includes('data-community-state="success"'), "Community page did not render on the server");
  assert(!html.includes('role="dialog"'), "Community persona chooser opened during SSR");
  await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached" });
  await page.waitForLoadState("networkidle");
  assert(await page.getByRole("dialog").count() === 0, "Community persona chooser opened during hydration");
  assert(await page.getByRole("button", { name: "Post here" }).count() === 1,
    `Hydrated Community has no posting action: ${await page.locator("main").allTextContents()}`);
  await page.getByRole("button", { name: "Post here" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  assert(await dialog.getByLabel("Community ID").count() === 0, "contextual composer exposed the raw Community ID field");
  await dialog.locator(`[data-community-context="${communityId}"]`).waitFor({ state: "visible" });
  await dialog.getByLabel("Title").fill(`Fixture ${community}`);
  await dialog.getByLabel("Post", { exact: true }).fill(body);
  await dialog.getByRole("button", { name: "Publish post" }).click();
  return dialog;
}

async function runTerminalScenario(browser, community, expectedText) {
  const { context, page } = await authenticatedPage(browser);
  try {
    const dialog = await openComposer(page, community, `Browser body for ${community}`);
    await dialog.getByText(expectedText, { exact: false }).waitFor({ state: "visible" });
    if (community === "published") {
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await page.getByRole("button", { name: "Post here" }).click();
      const freshDialog = page.getByRole("dialog");
      const freshPublish = freshDialog.getByRole("button", { name: "Publish post" });
      assert(await freshDialog.getByLabel("Community ID").count() === 0, "fresh contextual draft exposed the raw Community ID field");
      assert(await freshPublish.isDisabled(), "fresh contextual draft allowed publishing without content");
      await freshDialog.getByLabel("Title").fill("Fresh contextual draft");
      await freshDialog.getByLabel("Post", { exact: true }).fill("Fresh contextual body");
      assert(await freshPublish.isEnabled(), "fresh contextual draft did not become publishable with content");
      assert(await freshDialog.locator("[data-post-composer-state]").count() === 0, "published close retained a terminal state");
    }
  } finally {
    await context.close();
  }
}

let worker;
let browser;
let workerLog = "";
let workerSpawnError;
const appendWorkerLog = chunk => { workerLog = `${workerLog}${chunk.toString()}`.slice(-64 * 1024); };

try {
  await listen(upstream, apiPort);
  worker = spawn("bun", ["x", "vite", "dev", "--host", "127.0.0.1", "--port", String(solidPort), "--strictPort"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      NO_COLOR: "1",
      SOLID_API_NEXT_FIXTURE_ORIGIN: `http://127.0.0.1:${apiPort}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  worker.once("error", error => { workerSpawnError = error; });
  worker.stdout.on("data", appendWorkerLog);
  worker.stderr.on("data", appendWorkerLog);
  await waitForWorker(worker, () => workerSpawnError);
  await warmApplication();
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });

  await runTerminalScenario(browser, "published", "Post published.");
  await runTerminalScenario(browser, "manual-review", "awaiting review");
  await runTerminalScenario(browser, "blocked", "blocked by community policy");
  await runTerminalScenario(browser, "conflict", "conflicts with an existing submission (submission-conflict)");

  const { context, page } = await authenticatedPage(browser);
  try {
    let dialog = await openComposer(page, "lost-response", "Exact lost response body");
    await dialog.getByText("Checking whether your post was accepted", { exact: false }).waitFor({ state: "visible" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#app-root[data-hydrated='true']").waitFor({ state: "attached" });
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Post here" }).click();
    dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Check again" }).waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: "Check again" }).click();
    await dialog.getByText("Post published.", { exact: true }).waitFor({ state: "visible" });
  } finally {
    await context.close();
  }

  assert(lostAttempts.length === 2, `expected two lost-response attempts, received ${lostAttempts.length}`);
  assert(lostAttempts[0] === lostAttempts[1], "lost-response reload did not resend byte-identical JSON");
  assert(requests.length === 6, `expected six text POSTs, received ${requests.length}`);
  assert(sessionRequests.some(request => request.path === "/users/me"), "session resolution skipped GET /users/me");
  assert(sessionRequests.some(request => request.path === "/personas"), "session resolution skipped GET /personas");
  for (const request of sessionRequests) {
    assert(request.method === "GET", `${request.path} changed the session request method`);
    assert(request.cookie?.includes("pirate_session_fixture=session-text-e2e"), `${request.path} lost the session cookie`);
  }
  for (const request of requests) {
    assert(request.cookie?.includes("pirate_session_fixture=session-text-e2e"), `${request.community} lost the session cookie`);
    assert(request.csrf === "csrf-text-e2e", `${request.community} lost the CSRF header`);
    const body = JSON.parse(request.bodyText);
    assert(typeof body.idempotency_key === "string" && body.idempotency_key !== "", `${request.community} lost its action key`);
    assert(body.post_type === "text" && body.authorship_mode === "human_direct", `${request.community} changed the frozen contract body`);
  }
  console.log(JSON.stringify({
    ok: true,
    scenarios: ["published", "manual_review", "blocked", "typed_conflict", "lost_response_reload"],
    exactReplay: true,
    proxy: true,
    principal: "user-text-e2e",
  }));
} catch (error) {
  if (workerLog) process.stderr.write(workerLog);
  throw error;
} finally {
  if (browser !== undefined) await browser.close();
  if (worker !== undefined) await stop(worker);
  if (upstream.listening) await new Promise(resolve => upstream.close(resolve));
}
