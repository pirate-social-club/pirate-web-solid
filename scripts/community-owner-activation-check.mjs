import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SOLID_BASE_URL ?? "http://127.0.0.1:4186";
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const timestamp = "2026-09-07T00:00:00Z";
const oldProfile = {
  persona_id: "old-profile", object: "persona", status: "active",
  profile: { persona_id: "old-profile", object: "persona_profile", revision: 1, display_name: "Old profile", avatar_ref: null, cover_ref: null, bio: null, preferred_locale: null, primary_public_handle: null },
  wallet_set: { evm: null }, community_binding: { community_id: "old-community", binding_source: "first_membership" }, created_at: timestamp, retired_at: null,
};
let draft;
let activated = false;
let committed = false;
let commits = 0;
const presentation = { role: "owner", persona: { persona_id: "new-owner", object: "persona", display_name: "River Room", avatar_ref: null, primary_public_handle: null } };
const intent = () => ({
  creation_contract_version: "optional_route_v2", intent_id: "browser-owner-setup", revision: committed ? 3 : commits ? 2 : 1,
  draft, canonical_policy_hash: "a".repeat(64), canonical_policy_revision: 1, requirements: {}, expires_at: "2026-09-09T00:00:00Z",
  status: committed ? "committed" : "commit_ready",
  next_action: committed ? { kind: "none", reason: "committed" } : !commits || activated ? { kind: "commit" } : { kind: "activate_profile", persona_id: "new-owner" },
  persona_role_presentation: activated ? presentation : null,
  committed_resource: committed ? { authority_version: "optional_route_v2", community_id: "community_browser_owner", canonical_route: null, href: "/communities/community_browser_owner", persona_role_presentation: presentation } : null,
});
try {
  const context = await browser.newContext();
  await context.addCookies([{ name: "__Host-pirate_csrf", value: "browser-csrf", url: base.replace("http:", "https:"), secure: true, sameSite: "Lax" }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const respond = body => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/users/me") return respond({ id: "browser-owner", object: "user", verification_state: "unverified", created: 1788495833, verification_capabilities: Object.fromEntries(["unique_human", "age_over_18", "minimum_age", "nationality", "gender", "wallet_score"].map(key => [key, { state: "unverified" }])) });
    if (path === "/api/personas") return respond({ personas: [oldProfile] });
    if (path === "/api/community-creation-intents") {
      assert.equal(request.headers()["x-csrf-token"], "browser-csrf");
      draft = request.postDataJSON().draft;
      assert.equal(draft.public_name, "River Room");
      assert.deepEqual(draft.persona, { kind: "create_new" });
      return respond(intent());
    }
    if (path.endsWith("/browser-owner-setup/commit")) {
      commits += 1;
      if (commits > 1) { assert.equal(activated, true); committed = true; }
      return respond(intent());
    }
    if (path.endsWith("/browser-owner-setup")) return respond(intent());
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "provider_unavailable", message: "Local fixture has no provider", retryable: true } }) });
  });
  const response = await page.goto(new URL("/communities/new", base).href);
  const html = await response.text();
  assert(html.includes("Public name") && html.includes("data-create-community"));
  await page.locator("[data-creation-state='ready']").waitFor();
  assert.equal(await page.getByText("Use an existing profile", { exact: true }).count(), 0);
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("New place");
  await page.getByRole("textbox", { name: "Public name", exact: true }).fill("River Room");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.locator("[data-owner-activation]").waitFor();
  assert.equal(commits, 1);
  assert.equal(committed, false);
  assert(page.url().includes("intent_id=browser-owner-setup"));
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(commits, 1);
  // The real proof and account/index checks are exercised in API tests. Here
  // an interrupted activation completes before the browser resumes its URL.
  activated = true;
  await page.reload();
  await page.locator("[data-community-creation-progress] button").first().click();
  await page.locator("[data-committed-state]").waitFor();
  assert.equal(commits, 2);
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, ssrPublicName: true, boundFirstProfile: true, privateUntilActivation: true, dismissal: true, resumedPublication: true, commits }));
} finally {
  await browser.close();
}
