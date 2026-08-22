import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { request as playwrightRequest } from "playwright";

const apiPort = 8788;
const solidPort = 4174;
const solidOrigin = `http://127.0.0.1:${solidPort}`;
const expectedCookie = "__Host-pirate_session=session-e2e; __Host-pirate_csrf=csrf-e2e";
const requests = [];

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function responseFor(pathname, body) {
  if (pathname === "/health") return { status: 200, body: { ok: true } };
  if (pathname === "/posts/post-e2e/comments") return {
    status: 201,
    body: {
      submission_id: "submission-comment",
      href: "/comments/comment-e2e",
      surface: "comment",
      status: "published",
      result: { decision: "allow", reason_code: null },
      published_resource: { kind: "comment", comment_id: "comment-e2e", href: "/comments/comment-e2e" },
      review_ref: null,
      created_at: "2026-08-22T00:00:00.000Z",
      updated_at: "2026-08-22T00:00:00.000Z",
    },
  };
  if (pathname === "/comments/comment-e2e/replies") return {
    status: 201,
    body: {
      submission_id: "submission-reply",
      href: "/comments/reply-e2e",
      surface: "reply",
      status: "manual_review",
      result: { decision: "manual_review", reason_code: "review_required" },
      published_resource: null,
      review_ref: "case-e2e",
      created_at: "2026-08-22T00:00:00.000Z",
      updated_at: "2026-08-22T00:00:00.000Z",
    },
  };
  if (pathname === "/comments/comment-e2e/reports") return {
    status: 201,
    body: { report_id: "report-e2e", case_ref: "case-e2e", status: "open" },
  };
  if (pathname === "/moderation/cases/case-e2e/actions") return {
    status: 200,
    body: { action_id: "action-e2e", case_ref: "case-e2e", action: "approve", target_status: "published" },
  };
  if (pathname === "/posts/post-e2e/vote") return {
    status: 200,
    body: { post_id: "post-e2e", value: -1, upvote_count: 4, downvote_count: 2 },
  };
  if (pathname === "/posts/post-e2e/vote/clear") return {
    status: 200,
    body: { post_id: "post-e2e", value: 0, upvote_count: 4, downvote_count: 1 },
  };
  return { status: 404, body: { error: { code: "not_found", message: "not found", retryable: false } } };
}

const upstream = createServer(async (incoming, outgoing) => {
  try {
    const bodyText = await readBody(incoming);
    const pathname = new URL(incoming.url ?? "/", `http://127.0.0.1:${apiPort}`).pathname;
    if (pathname !== "/health") {
      requests.push({
        pathname,
        method: incoming.method,
        origin: incoming.headers.origin,
        csrf: incoming.headers["x-csrf-token"],
        cookie: incoming.headers.cookie,
        body: bodyText === "" ? null : JSON.parse(bodyText),
      });
    }
    const result = responseFor(pathname, bodyText);
    outgoing.writeHead(result.status, { "content-type": "application/json", "x-request-id": "engagement-e2e" });
    outgoing.end(JSON.stringify(result.body));
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

async function waitForWorker(child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Solid dev Worker exited with ${child.exitCode}`);
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

function stop(child) {
  if (child.exitCode === null) child.kill("SIGTERM");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await listen(upstream, apiPort);
const worker = spawn("bun", ["x", "vite", "dev", "--host", "127.0.0.1", "--port", String(solidPort), "--strictPort"], {
  cwd: new URL("..", import.meta.url),
  env: { ...process.env, NO_COLOR: "1" },
  stdio: ["ignore", "pipe", "pipe"],
});
let workerLog = "";
worker.stdout.on("data", chunk => { workerLog += chunk.toString(); });
worker.stderr.on("data", chunk => { workerLog += chunk.toString(); });

try {
  await waitForWorker(worker);
  const api = await playwrightRequest.newContext({
    baseURL: solidOrigin,
    extraHTTPHeaders: {
      cookie: expectedCookie,
      origin: solidOrigin,
      "x-csrf-token": "csrf-e2e",
    },
  });
  try {
    const calls = [
      ["/api/posts/post-e2e/comments", { idempotency_key: "comment-key", body: "Comment through Worker" }, 201],
      ["/api/comments/comment-e2e/replies", { idempotency_key: "reply-key", body: "Reply through Worker" }, 201],
      ["/api/comments/comment-e2e/reports", { idempotency_key: "report-key", reason_code: "spam" }, 201],
      ["/api/moderation/cases/case-e2e/actions", { idempotency_key: "action-key", action: "approve" }, 200],
      ["/api/posts/post-e2e/vote", { idempotency_key: "vote-key", value: -1 }, 200],
      ["/api/posts/post-e2e/vote/clear", { idempotency_key: "clear-key" }, 200],
    ];
    for (const [path, data, status] of calls) {
      const response = await api.post(path, { data });
      assert(response.status() === status, `${path} returned ${response.status()}`);
      assert(response.headers()["x-request-id"] === "engagement-e2e", `${path} lost response metadata`);
    }
  } finally {
    await api.dispose();
  }

  assert(requests.length === 6, `expected six upstream requests, received ${requests.length}`);
  for (const request of requests) {
    assert(!request.pathname.startsWith("/api/"), `Worker did not strip /api from ${request.pathname}`);
    assert(request.method === "POST", `${request.pathname} did not preserve POST`);
    assert(request.origin === solidOrigin, `${request.pathname} did not preserve Origin`);
    assert(request.csrf === "csrf-e2e", `${request.pathname} did not preserve CSRF`);
    assert(request.cookie === expectedCookie, `${request.pathname} did not preserve session cookies`);
  }
  assert(requests[0]?.body?.idempotency_key === "comment-key", "comment body changed in proxy");
  assert(requests[4]?.body?.value === -1, "vote body changed in proxy");
  assert(requests[5]?.body && !("value" in requests[5].body), "clear vote body gained a value field");
  console.log(JSON.stringify({ ok: true, requests: requests.map(request => request.pathname), origin: solidOrigin, csrf: true, cookies: true }));
} catch (error) {
  if (workerLog) process.stderr.write(workerLog);
  throw error;
} finally {
  stop(worker);
  await new Promise(resolve => upstream.close(resolve));
}
