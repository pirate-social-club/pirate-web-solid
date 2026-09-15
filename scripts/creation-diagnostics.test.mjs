import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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


// Exercise asynchronous teardown without launching Chromium on the shared host.
test("capture drains pending response bodies and pairs sanitized requests", async () => {
  const { EventEmitter } = await import("node:events");
  const { captureSanitizedNetworkDiagnostics } = await import("../e2e/fixtures/diagnostics.ts");
  const context = new EventEmitter();
  const diagnostics = captureSanitizedNetworkDiagnostics({ context: () => context });
  const request = {
    url: () => "https://example.invalid/api/community-creation-intents/private-intent/commit?token=private-query",
    method: () => "POST", resourceType: () => "fetch",
    postData: () => JSON.stringify({ token: "private-request-token", expected_revision: 3 }),
  };
  let finishBody;
  const body = new Promise(resolve => { finishBody = resolve; });
  context.emit("request", request);
  context.emit("response", { request: () => request, url: request.url, status: () => 409,
    headers: () => ({ "content-type": "application/json; charset=utf-8", authorization: "Bearer private-header", "set-cookie": "session=private-cookie" }), text: () => body });
  let stopped = false;
  const stopping = diagnostics.stop().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false);
  finishBody(JSON.stringify({ token: "private-response-token", revision: 4 }));
  await stopping;
  const events = JSON.parse(diagnostics.summary());
  assert.equal(events.length, 2);
  assert.equal(events[0].requestId, events[1].requestId);
  assert.equal(events[1].status, 409);
  assert.equal(events[1].body.revision.value, 4);
  for (const secret of ["private-intent", "private-query", "private-request-token", "private-response-token", "private-header", "private-cookie", "<input"]) assert.equal(diagnostics.summary().includes(secret), false);
  assert.equal(context.listenerCount("request"), 0);
  assert.equal(context.listenerCount("response"), 0);
  assert.equal(context.listenerCount("requestfailed"), 0);
});

test("capture bounds events and tolerates failed body reads", async () => {
  const { EventEmitter } = await import("node:events");
  const { captureSanitizedNetworkDiagnostics } = await import("../e2e/fixtures/diagnostics.ts");
  const context = new EventEmitter();
  const diagnostics = captureSanitizedNetworkDiagnostics({ context: () => context });
  const request = { url: () => "https://example.invalid/api/community-creation-intents", method: () => "POST", resourceType: () => "fetch", postData: () => null };
  context.emit("response", { request: () => request, url: request.url, status: () => 400, headers: () => ({}), text: () => Promise.reject(new Error("private transport details")) });
  await diagnostics.stop();
  assert.deepEqual(JSON.parse(diagnostics.summary())[0].body, { unavailable: true });
  const bounded = captureSanitizedNetworkDiagnostics({ context: () => context });
  for (let i = 0; i < 150; i++) context.emit("request", request);
  context.emit("response", { request: () => request, url: request.url, status: () => 409,
    headers: () => ({}), text: () => Promise.resolve('{"revision":4}') });
  await bounded.stop();
  const events = JSON.parse(bounded.summary());
  assert.equal(events.length, 100);
  assert.equal(events.at(-1).kind, "response");
  assert.equal(events.at(-1).status, 409);
  context.emit("request", request);
  assert.equal(bounded.summary(), JSON.stringify(events, null, 2));
});

test("persists two sanitized context summaries as one attached output artifact", async () => {
  const { EventEmitter } = await import("node:events");
  const { captureSanitizedNetworkDiagnostics, persistSanitizedNetworkDiagnostics } = await import("../e2e/fixtures/diagnostics.ts");
  const contexts = [new EventEmitter(), new EventEmitter()];
  const diagnostics = contexts.map(context => captureSanitizedNetworkDiagnostics({ context: () => context }));
  const supplied = JSON.stringify({
    raw_html: "<html><input value='otp-secret'></html>",
    authorization: "Bearer authorization-secret",
    cookie: "session=cookie-secret",
    otp: "123456",
    secret: "provider-secret",
  });
  for (const [index, context] of contexts.entries()) {
    const request = {
      url: () => `https://example.invalid/api/community-creation-intents/context-${index}`,
      method: () => "POST",
      resourceType: () => "fetch",
      postData: () => supplied,
    };
    context.emit("request", request);
    context.emit("response", {
      request: () => request,
      url: request.url,
      status: () => 500,
      headers: () => ({
        authorization: "Bearer response-header-secret",
        "set-cookie": "session=response-cookie-secret",
      }),
      text: () => Promise.resolve(supplied),
    });
  }

  const directory = await mkdtemp(join(tmpdir(), "sanitized-network-events-"));
  const attachments = [];
  const testInfo = {
    outputPath: name => join(directory, name),
    attach: async (name, attachment) => attachments.push({ name, attachment }),
  };
  try {
    await persistSanitizedNetworkDiagnostics(diagnostics, testInfo);
    const outputPath = join(directory, "sanitized-network-events.json");
    const bytes = await readFile(outputPath, "utf8");
    const output = JSON.parse(bytes);
    assert.equal(output.contexts.length, 2);
    assert.equal(output.contexts[0].length, 2);
    assert.equal(output.contexts[1].length, 2);
    assert.deepEqual(attachments, [{
      name: "sanitized-network-events",
      attachment: { path: outputPath, contentType: "application/json" },
    }]);
    for (const context of contexts) {
      assert.equal(context.listenerCount("request"), 0);
      assert.equal(context.listenerCount("response"), 0);
      assert.equal(context.listenerCount("requestfailed"), 0);
    }
    for (const unsafe of ["<html", "otp-secret", "authorization-secret", "cookie-secret", "123456", "provider-secret", "response-header-secret", "response-cookie-secret"]) {
      assert.equal(bytes.includes(unsafe), false);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
