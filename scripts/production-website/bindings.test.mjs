import assert from "node:assert/strict";
import test from "node:test";
import { bindingProposal, deploymentVersions, expectedDeployment, normalizedBindings, normalizedDomains, normalizedSettings } from "./bindings.mjs";

function fixture() {
  const vars = { API_NEXT_ORIGIN: "https://api-next.pirate.sc", HNS_COMMUNITY_APP_INGRESS_ENABLED: "false", HNS_HANDLE_HOST_INGRESS_ENABLED: "false" };
  const config = { vars, assets: { binding: "ASSETS" }, version_metadata: { binding: "CF_VERSION_METADATA" },
    durable_objects: { bindings: [{ name: "REPLAY", class_name: "Replay" }] }, secrets: { required: ["REQUIRED_SECRET"] },
    migrations: [{ tag: "v1" }], compatibility_date: "2026-08-13", compatibility_flags: ["nodejs_compat"],
    routes: [{ pattern: "pirate.sc", custom_domain: true }, { pattern: "hns-community-ingress.pirate.sc", custom_domain: true }], workers_dev: true, preview_urls: false };
  const before = { version: "11111111-1111-4111-8111-111111111111", bindings: normalizedBindings([
    ...Object.entries(vars).map(([name, text]) => ({ name, type: "plain_text", text: name.startsWith("HNS_") ? "true" : text })),
    { name: "ASSETS", type: "assets" }, { name: "CF_VERSION_METADATA", type: "version_metadata" },
    { name: "REPLAY", type: "durable_object_namespace", namespace_id: "a".repeat(32), class_name: "Replay" },
    { name: "REQUIRED_SECRET", type: "secret_text", text: "private-value-must-not-survive" },
    { name: "PRESERVED_SECRET", type: "secret_key", key_base64: "private-key-must-not-survive" },
  ]), runtime: { compatibility_date: "2026-08-13", compatibility_flags: ["nodejs_compat"], migration_tag: "v1", usage_model: "standard" },
    settings: { compatibility_date: "2026-08-13", compatibility_flags: ["nodejs_compat"], placement: {} },
    domains: normalizedDomains(config.routes.map(row => ({ hostname: row.pattern, service: "website" })), "website"),
    subdomain: { enabled: true, previews_enabled: false } };
  return { before, config };
}

test("Solid ASSETS is explicit and secret values are removed before evidence", () => {
  const { before } = fixture(); const bytes = JSON.stringify(before);
  assert.ok(!bytes.includes("private-value") && !bytes.includes("private-key"));
  assert.deepEqual(before.bindings.find(row => row.name === "ASSETS"), { name: "ASSETS", type: "assets" });
  assert.throws(() => normalizedBindings([{ name: "ASSETS", type: "assets", token: "unknown" }]));
  assert.throws(() => normalizedBindings([{ name: "A", type: "service", service: "foreign" }]));
  assert.throws(() => normalizedBindings([{ name: "A", type: "assets" }, { name: "A", type: "assets" }]));
});

test("candidate derivation changes the two ingress flags and retains namespaces, secret names and reserved routing", () => {
  const { before, config } = fixture(), proposal = bindingProposal(before, config);
  assert.deepEqual(proposal.changes.map(row => row.name), ["HNS_COMMUNITY_APP_INGRESS_ENABLED", "HNS_HANDLE_HOST_INGRESS_ENABLED"]);
  assert.equal(proposal.candidate.bindings.find(row => row.name === "REPLAY").namespace_id, "a".repeat(32));
  assert.ok(proposal.candidate.bindings.some(row => row.name === "PRESERVED_SECRET"));
  assert.deepEqual(proposal.candidate.domains, before.domains);
  assert.equal(proposal.candidate.subdomain.previews_enabled, false);
});

test("missing secrets, foreign namespace ownership and undeclared binding/route removals refuse", () => {
  for (const mutate of [
    f => { f.before.bindings = f.before.bindings.filter(row => row.name !== "REQUIRED_SECRET"); },
    f => { f.before.bindings.find(row => row.name === "REPLAY").script_name = "foreign"; },
    f => { f.before.bindings.push({ name: "UNDECLARED", type: "plain_text", text: "value" }); },
    f => { f.before.domains.push({ hostname: "unexpected.example", service: "website", environment: null }); },
  ]) { const f = fixture(); mutate(f); assert.throws(() => expectedDeployment(f.before, f.config)); }
});

test("settings omit bindings and author annotations and refuse unknown or token-bearing asset settings", () => {
  assert.deepEqual(normalizedSettings({ compatibility_date: "date", annotations: { author: "role_id" }, bindings: [{ text: "private" }] }),
    { compatibility_date: "date", placement: {} });
  assert.throws(() => normalizedSettings({ unexpected: true }));
  assert.throws(() => normalizedSettings({ assets: { jwt: "private" } }));
});

test("traffic must be the newest complete sole100percent deployment", () => {
  const older = { id: "old", created_on: "2026-10-30T00:00:00Z", versions: [{ version_id: "11111111-1111-4111-8111-111111111111", percentage: 100 }] };
  const latest = { id: "new", created_on: "2026-10-31T00:00:00Z", versions: [{ version_id: "22222222-2222-4222-8222-222222222222", percentage: 100 }] };
  assert.deepEqual(deploymentVersions([older, latest]), { deployment: "new", version: latest.versions[0].version_id });
  assert.throws(() => deploymentVersions([{ ...latest, versions: [{ ...latest.versions[0], percentage: 50 }] }]));
  assert.throws(() => deploymentVersions([{ ...latest, versions: [...latest.versions, ...older.versions] }]));
  assert.throws(() => deploymentVersions([{ ...latest, created_on: "invalid" }]));
});
