import { test } from "node:test";
import assert from "node:assert/strict";
import { isCreationCall, sanitizeCreationBody } from "../e2e/fixtures/creation-diagnostics.ts";

test("captures creation endpoints only, including commit and excluding provider auth", () => {
  for (const path of ["/api/community-creation-intents", "/community-creation-intents/intent-1", "/api/community-creation-intents/intent-1/commit"]) {
    assert.equal(isCreationCall(`https://example.invalid${path}`), true);
  }
  for (const path of ["/auth/sign-in", "/api/personas", "/api/v1/passwordless/authenticate", "/api/community-creation-intents-fake"]) {
    assert.equal(isCreationCall(`https://example.invalid${path}`), false);
  }
});

test("preserves malformed draft constraints without exposing private values", () => {
  const body = sanitizeCreationBody(JSON.stringify({
    draft: { public_name: "  ", name: "private community", description: null,
      persona: { kind: "create_new" }, policy: { version: 2, accessPaths: [] } },
    token: "secret-token", nested: { authorization: "Bearer secret", email: "private@example.invalid" },
    idempotency_key: "private-operation-id",
  }));
  assert.deepEqual(body.draft.public_name, { type: "string", length: 2, trimmedLength: 0, hasControlCharacters: false });
  assert.equal(body.draft.persona.kind, "create_new");
  assert.equal(body.draft.policy.version.value, 2);
  assert.equal(body.draft.description, null);
  const serialized = JSON.stringify(body);
  for (const secret of ["secret-token", "Bearer secret", "private@example.invalid", "private community", "private-operation-id"]) assert.equal(serialized.includes(secret), false);
});

test("keeps known decode messages and structure, redacts echoed input, bounds invalid bodies", () => {
  const body = sanitizeCreationBody(JSON.stringify({ _tag: "BadRequest", message: "Invalid body request", detail: { actual: "sensitive input" } }));
  assert.equal(body.message, "Invalid body request");
  assert.equal(JSON.stringify(body).includes("sensitive input"), false);
  assert.deepEqual(sanitizeCreationBody(null), { absent: true });
  assert.equal(sanitizeCreationBody("not JSON").invalidJson, true);
  assert.equal(sanitizeCreationBody("a".repeat(65537)).omitted, "body exceeds capture limit");
});


test("browser capture pairs a creation POST with its fully read error response", async () => {
  const { createServer } = await import("node:http");
  const { chromium } = await import("playwright");
  const { captureSanitizedNetworkDiagnostics } = await import("../e2e/fixtures/diagnostics.ts");
  const server = createServer((request, response) => {
    if (request.method === "GET") { response.end("<html><body>Diagnostic fixture</body></html>"); return; }
    request.resume();
    request.on("end", () => {
      response.writeHead(400, { "Content-Type": "application/json" });
      response.write('{"_tag":"BadRequest",');
      setTimeout(() => response.end('"message":"Invalid body request","token":"private-response-token"}'), 30);
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    const diagnostics = captureSanitizedNetworkDiagnostics(page);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(async () => { await fetch("/api/community-creation-intents", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer private-header" },
      body: JSON.stringify({ draft: { public_name: "private-name", persona: { kind: "create_new" } }, token: "private-request-token" }),
    }); });
    await diagnostics.stop();
    const events = JSON.parse(diagnostics.summary()).filter(event => event.method === "POST");
    assert.equal(events.length, 2);
    assert.equal(events[0].kind, "request");
    assert.equal(events[0].requestId, events[1].requestId);
    assert.equal(events[1].status, 400);
    assert.equal(events[1].body.message, "Invalid body request");
    for (const secret of ["private-header", "private-request-token", "private-response-token", "private-name"]) {
      assert.equal(diagnostics.summary().includes(secret), false);
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
