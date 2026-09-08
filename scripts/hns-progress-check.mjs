import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright";

// Built Worker on 4186, API_NEXT_ORIGIN=http://127.0.0.1:4199.
// This checks browser/SSR transport. The API PG test separately drives real
// handlers, preparation, verification, readiness and activation end to end.
const base = "http://127.0.0.1:4186";
const communityId = "community_midnight";
const common = { community_id: communityId, attachment_intent_id: "attachment-1", root_import_session_id: "session-1", root_label: "midnight", expires_at: "2099-01-01T00:00:00.000Z", replayed: false };
const plan = { acknowledgement_required: true, added_records: [], current_records: [], preserved_records: [], preserved_unknown_record_types: [], removed_conflicts: [], replacement_records: [{ type: "NS", ns: "ns1.pirate" }, { type: "TXT", txt: ["pirate-proof"] }], replacement_semantics: "complete_resource", version: "pirate-hns-root-import-publish-plan-v1" };
let phase = "empty";
let failReads = false;
let rejectWrites = false;
const requests = [];
const snapshot = () => ({ ...common, status: phase === "checking" ? "awaiting_owner_update" : phase, revision: phase === "provisioning" ? 2 : 3, publish_plan: phase === "provisioning" ? null : plan, publish_plan_sha256: phase === "provisioning" ? null : "a".repeat(64), readiness_result_sha256: null, retry_after_seconds: 2, ...(phase === "provisioning" ? {} : { publication_check_pending: phase === "checking" }) });
const upstream = createServer(async (request, response) => {
  const path = new URL(request.url, base).pathname;
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : undefined;
  requests.push({ method: request.method, path, body });
  const send = (value, status = 200) => { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(value)); };
  const unavailable = () => send({ error: { code: "upstream_unavailable", message: "Unavailable", retryable: true } }, 503);
  if (path === "/c/midnight") return send({ community_id: communityId, canonical_route: { family: "hns", root_label: "midnight", root_label_display: "midnight", path_segment: "midnight", href: "/c/midnight", app_host: "app.midnight" } });
  if (path.endsWith("/preview")) return send({ id: communityId, object: "community_preview", display_name: "Midnight", membership_mode: "open", human_verification_lane: null, moderators: [], membership_gate_summaries: [], rules: [], created: 1700000000 });
  if (path.endsWith("/me/capabilities")) return send({ community_id: communityId, role: "owner", role_assignment_id: "owner-1", capabilities: ["moderation.view", "moderation.act"] });
  if (path.endsWith("/handle-sales-management")) return send({ community_id: communityId, sale_namespace_candidates: [], offering_authoring_preset: { kind: "hns_hosted_persona_free_v1", reserved_labels_id: "reserved", expected_reserved_labels_revision: 1, broad_qualification_policy_id: "none_v1", expected_broad_qualification_policy_revision: 1, expected_account_directory_binding_version: "1", pricing_id: "platform_free_handles_v1", expected_pricing_revision: 1, issuance_driver_id: "hosted_persona-local", expected_issuance_driver_version: "1", quote_ttl_seconds: 120, reservation_ttl_seconds: 300 }, observed_at: "2026-09-08T00:00:00Z" });
  if (path.includes("/handle-sales-management/")) return send({ items: [], next_cursor: null });
  if (path.endsWith("/hns-root-imports")) {
    if (request.method === "GET") return send({ community_id: communityId, attachment: null, session: phase === "empty" ? null : snapshot() });
    assert.equal(request.method, "POST");
    if (rejectWrites) return send({ error: { code: "auth_error", message: "Authentication failed", retryable: false } }, 401);
    phase = "provisioning";
    return send(snapshot(), 202);
  }
  if (path.endsWith("/hns-root-imports/session-1")) return failReads ? unavailable() : send(snapshot());
  if (path.endsWith("/hns-root-imports/session-1/poll")) {
    assert.equal(body.expected_revision, 3);
    assert.equal(body.provisioning_name_signature, undefined);
    phase = "checking";
    return send(snapshot(), 202);
  }
  return send({ error: { code: "auth_error", message: "Sign in required", retryable: false } }, 401);
});
await new Promise(resolve => upstream.listen(4199, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.addCookies([
    { name: "__Host-pirate_session", value: "owner", url: "https://127.0.0.1:4186", secure: true, sameSite: "Lax" },
    { name: "__Host-pirate_csrf", value: "csrf-1", url: "https://127.0.0.1:4186", secure: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/c/midnight/settings/namespace`);
  await page.locator("#community-hns-name").fill("midnight");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const panel = page.locator("[data-community-namespace-settings]");
  const start = page.getByRole("button", { name: "Start verification", exact: true });
  await start.waitFor();
  const before = await panel.boundingBox();
  const beforeText = await panel.innerText();
  await start.click();
  await page.waitForFunction(() => document.querySelector('[data-next-action="wait"]'), { timeout: 10000 }).catch(async error => { console.error(await page.locator("main").innerText()); throw error; });
  assert.deepEqual(await panel.boundingBox(), before);
  assert.equal(await panel.innerText(), beforeText);
  const writes = () => requests.filter(request => request.method === "POST");
  assert.equal(writes().length, 1);
  phase = "awaiting_owner_update";
  await page.getByRole("heading", { name: "Your records are ready to publish" }).waitFor();
  assert.equal(writes().length, 1, "Preparation progress must use GET only");
  const publish = page.getByRole("button", { name: "I published all records manually", exact: true });
  const recordsBox = await panel.boundingBox();
  const recordsText = await panel.innerText();
  await Promise.all([page.waitForResponse(response => response.url().endsWith("/session-1/poll") && response.status() === 202), publish.click()]);
  assert.deepEqual(await panel.boundingBox(), recordsBox);
  assert.equal(await panel.innerText(), recordsText.replace("Your records are ready to publish", "Checking published records"));
  assert.notEqual(await publish.getAttribute("aria-busy"), "true");
  assert.equal(writes().length, 2);
  await page.reload();
  await page.getByRole("heading", { name: "Checking published records" }).waitFor();
  assert.equal(await publish.isDisabled(), true);
  failReads = true;
  await page.getByText("Could not refresh verification status. Select Retry status to reconnect.").waitFor();
  assert.equal(await publish.isDisabled(), true);
  assert.deepEqual(await panel.boundingBox(), recordsBox);
  assert.equal(writes().length, 2);
  failReads = false;
  await page.getByRole("button", { name: "Retry status", exact: true }).click();
  await page.waitForFunction(() => !document.body.textContent.includes("Could not refresh verification status."));
  assert.equal(await publish.isDisabled(), true);
  assert.equal(writes().length, 2, "Resuming progress must not acknowledge twice");
  assert.doesNotMatch(await panel.innerText(), /Retry after|Check status|Retry check|Checking records/);
  // Cross the actual browser deadline, then recover through missing CSRF and
  // an expired server session. These are transport fixtures, not live writes.
  phase = "awaiting_owner_update";
  common.expires_at = new Date(Date.now() + 60_000).toISOString();
  await page.clock.install();
  await page.reload();
  await page.getByRole("heading", { name: "Your records are ready to publish" }).waitFor();
  await page.locator("time").waitFor();
  await page.clock.fastForward(61_000);
  const regenerate = page.getByRole("button", { name: "Get a new record list", exact: true });
  await regenerate.waitFor();
  const expiredBox = await panel.boundingBox();
  const expiredText = await panel.innerText();
  await context.clearCookies({ name: "__Host-pirate_csrf" });
  await regenerate.click();
  await page.getByText("Refresh the page before changing the community address.", { exact: true }).waitFor();
  assert.equal(writes().length, 2, "Missing CSRF must send no write");
  assert.deepEqual(await panel.boundingBox(), expiredBox);
  assert.equal(await panel.innerText(), expiredText);
  await context.addCookies([{ name: "__Host-pirate_csrf", value: "csrf-2", url: "https://127.0.0.1:4186", secure: true, sameSite: "Lax" }]);
  rejectWrites = true;
  await regenerate.click();
  await page.getByText("Your sign-in has expired. Sign in again, then retry. Your namespace is saved.", { exact: true }).waitFor();
  assert.equal(writes().length, 3);
  assert.deepEqual(await panel.boundingBox(), expiredBox);
  rejectWrites = false;
  common.expires_at = "2099-01-01T00:00:00.000Z";
  await regenerate.click();
  await page.waitForFunction(() => document.querySelector('[data-next-action="wait"]'));
  assert.equal(writes().length, 4, "Regeneration starts with one click");
  assert.equal(writes()[2].body.idempotency_key, writes()[3].body.idempotency_key, "Retry must reuse its key");
  assert.equal(writes()[3].body.root_label, "midnight");
  phase = "awaiting_owner_update";
  await page.clock.fastForward(2_000);
  await page.getByRole("heading", { name: "Your records are ready to publish" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, preparationGets: true, oneAcknowledgement: true, quietPendingButtons: true, reloadResumes: true, stablePendingAndFailureLayout: true, noCountdown: true, expiryRecovery: true, missingCsrfNoWrite: true, expiredSessionRecovery: true }));
} finally {
  await browser.close();
  await new Promise(resolve => upstream.close(resolve));
}
