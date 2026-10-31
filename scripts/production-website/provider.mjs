import assert from "node:assert/strict";
import { APP_REPO, ACCOUNT, CONFIG_PATH, NODE, WORKER, WRANGLER_BIN } from "./paths.mjs";
import { apiContext } from "./context.mjs";
import { comparable, deploymentVersions, normalizedBindings, normalizedDomains, normalizedRuntime, normalizedSettings, normalizedSubdomain } from "./bindings.mjs";
import { digest, hash, validateModules } from "./contract.mjs";
import { criticalAssets } from "./candidate.mjs";

async function commandJson(argv, maximum = 2 * 1024 * 1024) {
  const { commands } = apiContext();
  const result = await commands.runDeploymentCommand(argv, APP_REPO, AbortSignal.timeout(30_000));
  assert.equal(result.exitCode, 0, "Website provider read refused"); assert.ok(result.stdout.length < maximum);
  return JSON.parse(result.stdout);
}

/** Provider output is reduced before any receipt can contain it. Authors and secret values are omitted. */
export async function collectWebsite() {
  const { provider } = apiContext();
  const deployment = () => commandJson([NODE, WRANGLER_BIN, "deployments", "list", "--config", CONFIG_PATH, "--json"]);
  const serving = deploymentVersions(await deployment());
  const version = await commandJson([NODE, WRANGLER_BIN, "versions", "view", serving.version, "--config", CONFIG_PATH, "--json"]);
  assert.equal(version.id, serving.version);
  const bindings = normalizedBindings(version.resources.bindings), runtime = normalizedRuntime(version.resources.script_runtime);
  const settings = normalizedSettings(await provider.cloudflareApi("/workers/scripts/" + WORKER + "/settings"));
  const latest = await provider.cloudflareApi("/workers/scripts/" + WORKER + "/versions");
  assert.ok(Array.isArray(latest.items) && latest.items.length > 0); assert.match(latest.items[0].id ?? "", /^[a-f0-9-]{36}$/u);
  const allDomains = await provider.cloudflareApi("/workers/domains?per_page=100");
  assert.ok(Array.isArray(allDomains) && allDomains.length < 100, "Custom-domain inventory requires reviewed pagination");
  const domains = normalizedDomains(allDomains, WORKER);
  const subdomain = normalizedSubdomain(await provider.cloudflareApi("/workers/scripts/" + WORKER + "/subdomain"));
  assert.deepEqual(deploymentVersions(await deployment()), serving, "Website traffic changed during observation");
  const rawMessage = version.annotations?.["workers/message"];
  const message = typeof rawMessage === "string" && /^git:[a-f0-9]{40}$/u.test(rawMessage) ? rawMessage : null;
  return { version: serving.version, deployment: serving.deployment, message, message_sha256: typeof rawMessage === "string" ? hash(rawMessage) : null,
    bindings, runtime, settings, domains, subdomain, latest_upload_version: latest.items[0].id, latest_upload_is_serving: latest.items[0].id === serving.version };
}

export async function compiledModules(candidate, versionId) {
  const { commands, provider } = apiContext();
  const token = await provider.managedToken();
  const output = await commands.runDeploymentCommand(["cf", "workers", "versions", "get", versionId, "--worker-id", WORKER, "--include", "modules"],
    APP_REPO, AbortSignal.timeout(30_000), { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: ACCOUNT });
  assert.equal(output.exitCode, 0); assert.ok(output.stdout.length < 48 * 1024 * 1024);
  const version = JSON.parse(output.stdout); assert.equal(version.id, versionId);
  assert.equal(version.main_module, "index.js", "Provider entry module differs");
  assert.equal(version.compatibility_date, candidate.config.compatibility_date);
  assert.deepEqual([...(version.compatibility_flags ?? [])].sort(), [...candidate.config.compatibility_flags].sort());
  return validateModules(version.modules, candidate.modules);
}

/** Read only exact reviewed immutable client paths; no manifest-upload POST is used as a probe. */
export async function servedCriticalAssets(candidate, names) {
  const selected = criticalAssets(candidate, names);
  assert.ok(selected.every(row => row.bytes <= 4 * 1024 * 1024) && selected.reduce((sum, row) => sum + row.bytes, 0) <= 16 * 1024 * 1024);
  const observed = [];
  for (const row of selected) {
    const response = await fetch(new URL("/" + row.name, "https://pirate.sc"), { redirect: "error", credentials: "omit", cache: "no-store",
      signal: AbortSignal.timeout(10_000), headers: { "accept-encoding": "identity" } });
    assert.equal(response.status, 200); assert.ok(response.body);
    const chunks = []; let total = 0;
    for await (const chunk of response.body) { total += chunk.length; assert.ok(total <= row.bytes); chunks.push(chunk); }
    assert.equal(total, row.bytes); assert.equal(hash(Buffer.concat(chunks)), row.sha256);
    observed.push({ ...row, status: 200 });
  }
  return observed;
}

export async function verifyServing(candidate, proposal, names) {
  const before = await collectWebsite(); assert.equal(before.message, "git:" + candidate.source);
  assert.equal(before.latest_upload_is_serving, true, "Candidate is not the latest upload");
  assert.deepEqual(comparable(before), proposal.candidate, "Serving website binding/settings/routing differs");
  const modules = await compiledModules(candidate, before.version);
  assert.equal(digest(modules), candidate.modules_sha256);
  const assets = await servedCriticalAssets(candidate, names);
  const after = await collectWebsite(); assert.deepEqual(after, before, "Website identity changed during readback");
  return { ...after, candidate_verified: true, compiled_modules_sha256: digest(modules), compiled_module_count: modules.length,
    critical_assets: assets, remote_full_asset_membership_proven: false };
}
