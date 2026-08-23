import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { chromium } from "playwright";

const apiPort = 8788;
const solidPort = 4182;
const solidOrigin = `http://127.0.0.1:${solidPort}`;
const requests = [];
const lostAttempts = [];
const sessionRequests = [];

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
      sessionRequests.push({ method: incoming.method, cookie: incoming.headers.cookie });
      outgoing.writeHead(200, { "content-type": "application/json" });
      outgoing.end(JSON.stringify(userFixture()));
      return;
    }
    const match = /^\/communities\/([^/]+)\/posts$/u.exec(pathname);
    if (incoming.method === "POST" && match?.[1] !== undefined) {
      const community = decodeURIComponent(match[1]);
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
  await page.getByRole("button", { name: "Create post" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Community ID").fill(community);
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
    env: { ...process.env, NO_COLOR: "1", API_NEXT_ORIGIN: `http://127.0.0.1:${apiPort}` },
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
  await runTerminalScenario(browser, "conflict", "conflicts with an existing submission");

  const { context, page } = await authenticatedPage(browser);
  try {
    let dialog = await openComposer(page, "lost-response", "Exact lost response body");
    await dialog.getByText("Checking whether your post was accepted", { exact: false }).waitFor({ state: "visible" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("[data-home-session='authenticated']").waitFor({ state: "attached" });
    await page.getByRole("button", { name: "Create post" }).click();
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
