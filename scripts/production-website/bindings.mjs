import assert from "node:assert/strict";
import { digest, exactKeys, object } from "./contract.mjs";

const compare = (a, b) => a.name.localeCompare(b.name);
/** Solid owns the ASSETS case; backend inventory semantics remain unchanged. */
export function normalizedBindings(input) {
  assert.ok(Array.isArray(input)); const seen = new Set();
  return input.map(value => {
    const row = object(value); assert.ok(typeof row.name === "string" && row.name && !seen.has(row.name)); seen.add(row.name);
    assert.ok(typeof row.type === "string");
    if (["secret_text", "secret_key"].includes(row.type)) return { name: row.name, type: row.type };
    if (["assets", "version_metadata"].includes(row.type)) { exactKeys(row, ["name", "type"]); return { name: row.name, type: row.type }; }
    if (row.type === "plain_text") { exactKeys(row, ["name", "type", "text"]); assert.equal(typeof row.text, "string"); return { ...row }; }
    if (row.type === "durable_object_namespace") {
      const allowed = ["name", "type", "namespace_id", "class_name", "script_name", "environment"];
      assert.ok(Object.keys(row).every(key => allowed.includes(key)));
      assert.match(row.namespace_id ?? "", /^[a-f0-9]{32}$/u); assert.equal(typeof row.class_name, "string");
      assert.ok(row.script_name === undefined || row.script_name === null || typeof row.script_name === "string");
      assert.ok(row.environment === undefined || row.environment === null || typeof row.environment === "string");
      return { name: row.name, type: row.type, namespace_id: row.namespace_id, class_name: row.class_name,
        script_name: row.script_name ?? null, environment: row.environment ?? null };
    }
    throw new Error("Unsupported website binding inventory");
  }).sort(compare);
}
export function normalizedRuntime(input) {
  const row = object(input); assert.ok(Object.keys(row).every(key => ["compatibility_date", "compatibility_flags", "migration_tag", "usage_model"].includes(key)));
  assert.equal(typeof row.compatibility_date, "string"); assert.ok(Array.isArray(row.compatibility_flags) && row.compatibility_flags.every(item => typeof item === "string"));
  assert.equal(typeof row.usage_model, "string"); assert.ok(row.migration_tag == null || typeof row.migration_tag === "string");
  return { compatibility_date: row.compatibility_date, compatibility_flags: [...row.compatibility_flags].sort(), migration_tag: row.migration_tag ?? null, usage_model: row.usage_model };
}
export function normalizedSettings(input) {
  const row = object(input), allowed = ["compatibility_date", "compatibility_flags", "usage_model", "limits", "logpush", "observability", "placement", "tail_consumers", "tags", "assets"];
  assert.ok(Object.keys(row).every(key => [...allowed, "bindings", "annotations"].includes(key)), "Unreviewed website setting");
  const result = Object.fromEntries(allowed.filter(key => row[key] !== undefined).map(key => [key, structuredClone(row[key])]));
  if (result.compatibility_flags !== undefined) {
    assert.ok(Array.isArray(result.compatibility_flags) && result.compatibility_flags.every(value => typeof value === "string"));
    result.compatibility_flags.sort();
  }
  if (result.assets !== undefined) {
    assert.ok(Object.keys(object(result.assets)).every(key => ["binding", "html_handling", "not_found_handling", "run_worker_first"].includes(key)), "Unreviewed website asset setting");
  }
  result.placement ??= {}; delete result.placement.last_analyzed_at; delete result.placement.status;
  return result;
}
export function deploymentVersions(input) {
  const deployments = Array.isArray(input) ? input : object(input).deployments;
  assert.ok(Array.isArray(deployments) && deployments.length > 0);
  assert.ok(deployments.every(row => Number.isFinite(Date.parse(row.created_on))));
  const latest = [...deployments].sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
  assert.ok(Array.isArray(latest.versions) && latest.versions.length === 1);
  const serving = latest.versions[0]; assert.equal(serving.percentage, 100); assert.match(serving.version_id ?? "", /^[a-f0-9-]{36}$/u);
  return { deployment: latest.id, version: serving.version_id };
}
export function normalizedDomains(input, worker) {
  assert.ok(Array.isArray(input)); const domains = input.filter(row => row.service === worker).map(row => {
    assert.equal(typeof row.hostname, "string");
    return { hostname: row.hostname, service: row.service, environment: row.environment ?? null };
  }).sort((a, b) => a.hostname.localeCompare(b.hostname));
  assert.equal(new Set(domains.map(row => row.hostname)).size, domains.length);
  return domains;
}
export function normalizedSubdomain(input) {
  const row = object(input); assert.equal(typeof row.enabled, "boolean"); assert.equal(typeof row.previews_enabled, "boolean");
  return { enabled: row.enabled, previews_enabled: row.previews_enabled };
}

/** Derive a candidate from actual nonsecret settings and exactly the validated flat config. */
export function expectedDeployment(before, config) {
  const bindings = [];
  for (const [name, text] of Object.entries(config.vars)) { assert.equal(typeof text, "string"); bindings.push({ name, type: "plain_text", text }); }
  bindings.push({ name: config.assets.binding, type: "assets" });
  bindings.push({ name: config.version_metadata.binding, type: "version_metadata" });
  for (const declared of config.durable_objects.bindings) {
    const actual = before.bindings.find(row => row.name === declared.name);
    assert.ok(actual && actual.type === "durable_object_namespace"); assert.equal(actual.class_name, declared.class_name);
    assert.equal(actual.script_name, declared.script_name ?? null); assert.equal(actual.environment, declared.environment ?? null);
    bindings.push(actual);
  }
  const secrets = before.bindings.filter(row => ["secret_text", "secret_key"].includes(row.type));
  for (const name of config.secrets.required) assert.ok(secrets.some(row => row.name === name), "Missing required website secret name");
  bindings.push(...secrets);
  const known = new Set(bindings.map(row => row.name));
  assert.ok(before.bindings.every(row => known.has(row.name)), "Upload would remove an undeclared existing binding");
  const runtime = { compatibility_date: config.compatibility_date, compatibility_flags: [...config.compatibility_flags].sort(),
    migration_tag: config.migrations.at(-1)?.tag ?? null, usage_model: "standard" };
  const settings = normalizedSettings({ ...before.settings, compatibility_date: config.compatibility_date, compatibility_flags: config.compatibility_flags });
  const domains = config.routes.map(row => {
    assert.equal(row.custom_domain, true); const current = before.domains.find(item => item.hostname === row.pattern);
    assert.ok(current, "Required website custom domain is absent"); return current;
  }).sort((a, b) => a.hostname.localeCompare(b.hostname));
  assert.deepEqual(domains, before.domains, "Unreviewed website route removal");
  return { bindings: normalizedBindings(bindings), runtime, settings, domains,
    subdomain: { enabled: config.workers_dev, previews_enabled: config.preview_urls } };
}
export function comparable(snapshot) {
  return { bindings: snapshot.bindings, runtime: snapshot.runtime, settings: snapshot.settings, domains: snapshot.domains, subdomain: snapshot.subdomain };
}
export function bindingProposal(before, config) {
  const candidate = expectedDeployment(before, config);
  return { baseline_version: before.version, baseline_sha256: digest(comparable(before)), candidate_sha256: digest(candidate),
    settings_sha256: digest(before.settings), candidate_settings_sha256: digest(candidate.settings), candidate,
    changes: [...new Set([...before.bindings, ...candidate.bindings].map(row => row.name))].sort().flatMap(name => {
      const prior = before.bindings.find(row => row.name === name), next = candidate.bindings.find(row => row.name === name);
      return digest(prior ?? null) === digest(next ?? null) ? [] : [{ name, before_sha256: prior ? digest(prior) : null, after_sha256: next ? digest(next) : null }];
    }) };
}
