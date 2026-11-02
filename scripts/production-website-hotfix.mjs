/**
 * Guarded upload for a website-only correction on an unchanged backend.
 *
 * The November 1 cutover executor is bound to that release's database migration
 * and its spent attempt, so it cannot carry a later website change. This keeps
 * the checks that apply to a website change and has no database or backend
 * phase. It refuses any binding, setting or domain change, so a release that
 * needs one must not use this tool.
 *
 * snapshot  read-only: proves every precondition without writing to the provider
 * apply     one upload, guarded by an exclusive marker, then verify
 * verify    read-only: proves the candidate is serving, by compiled and served bytes
 * rollback  returns all traffic to the named baseline version
 *
 * A marker is never reset. After an uncertain result, run verify, then decide.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile, lstat, realpath } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  bindingProposal, comparable, deploymentVersions, normalizedBindings, normalizedDomains,
  normalizedRuntime, normalizedSettings, normalizedSubdomain,
} from "./production-website/bindings.mjs";
import { digest, hash, validateModules } from "./production-website/contract.mjs";
import { websiteArtifactDigest } from "./website-production-artifacts.mjs";
import { checkWebsiteProductionConfig } from "./website-production-config.mjs";
import { assertPublishedWebsiteSource } from "./website-production-source-preflight.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ACCOUNT = "08a4c22cf52e2ecae883e36f80a33f4a";
const WORKER = "pirate-web-solid-production";
const ORIGIN = "https://pirate.sc";
const CONFIG = "dist/ssr/wrangler.json";
const WRANGLER = join(ROOT, "node_modules/wrangler/bin/wrangler.js");
const TOOL_KEYS = ["PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TZ", "TMPDIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME",
  "XDG_DATA_HOME", "XDG_RUNTIME_DIR", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY"];
const SHA = /^[a-f0-9]{40}$/u, DIGEST = /^[a-f0-9]{64}$/u, VERSION = /^[a-f0-9-]{36}$/u;
const OPTIONS = {
  snapshot: { source: SHA, artifact: DIGEST, receipt: DIGEST, baseline: VERSION },
  apply: { source: SHA, artifact: DIGEST, receipt: DIGEST, baseline: VERSION, evidence: null },
  verify: { source: SHA, artifact: DIGEST, receipt: DIGEST, evidence: null },
  rollback: { baseline: VERSION, from: VERSION, evidence: null },
};

/** Exact options only: a release cannot select another provider, worker or config. */
export function parseArguments(argv) {
  const [mode, ...rest] = argv;
  const shape = OPTIONS[mode];
  assert.ok(shape, "Unknown mode");
  assert.equal(rest.length, Object.keys(shape).length * 2, "Unexpected arguments");
  const result = { mode };
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index]?.replace(/^--/u, ""), value = rest[index + 1];
    assert.ok(rest[index].startsWith("--") && name in shape && !(name in result), "Unexpected option");
    if (shape[name]) assert.match(value, shape[name]);
    else assert.ok(isAbsolute(value), "Evidence path must be absolute");
    result[name] = value;
  }
  assert.equal(Object.keys(result).length - 1, Object.keys(shape).length, "Missing option");
  return result;
}

/** Provider children get OS and transport configuration only, never an injected token. */
export function toolEnvironment(input = process.env) {
  assert.equal(input.CLOUDFLARE_API_TOKEN, undefined, "An injected provider token overrides the managed login");
  const result = { CLOUDFLARE_ACCOUNT_ID: ACCOUNT, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1" };
  for (const key of TOOL_KEYS) if (input[key] !== undefined) result[key] = input[key];
  return result;
}

export const deployCommand = (node, wrangler, source) =>
  [node, wrangler, "deploy", "--config", CONFIG, "--message", "git:" + source];
export const rollbackCommand = (node, wrangler, baseline) =>
  [node, wrangler, "versions", "deploy", baseline + "@100", "--yes", "--config", CONFIG, "--message", "rollback to " + baseline];

export function assertPreparedReceipt(receipt, expected) {
  assert.equal(receipt.kind, "pirate-website-production-prepared-v1");
  assert.equal(receipt.sourceSha, expected.source, "Receipt names another source");
  assert.equal(receipt.buildSha256, expected.artifact, "Receipt names another artifact");
}

export function assertBaseline(before, baseline) {
  assert.equal(before.version, baseline, "Serving version is not the reviewed baseline");
  assert.equal(before.latest_upload_is_serving, true, "Latest upload is not the serving baseline");
}

/** The artifact may change application bytes only, so the proposal must be a no-op. */
export function assertConfigurationUnchanged(proposal, before) {
  assert.deepEqual(proposal.changes, [], "Upload would change a binding");
  assert.equal(proposal.candidate_sha256, digest(comparable(before)), "Upload would change website configuration");
}

export function assertServingCandidate(after, source, expected) {
  assert.equal(after.message, "git:" + source, "Serving version names another source");
  assert.equal(after.latest_upload_is_serving, true, "Candidate is not the latest upload");
  assert.equal(digest(comparable(after)), expected, "Serving configuration differs");
}

/** Assets the public HTML references, which must all belong to the candidate. */
export function referencedAssets(html) {
  const names = [...html.matchAll(/(?:src|href)="\/(assets\/[a-zA-Z0-9_.-]+\.(?:js|css))"/gu)].map(match => match[1]);
  const unique = [...new Set(names)].sort();
  assert.ok(unique.some(name => name.endsWith(".js")) && unique.some(name => name.endsWith(".css")), "Public HTML references no bundle");
  return unique;
}

/** Exclusive create: a second apply or rollback refuses instead of repeating an effect. */
export function writeOnce(directory, name, value) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}

function run(argv, environment, timeout = 30_000, maxBuffer = 64 * 1024 * 1024) {
  return new Promise(done => {
    execFile(argv[0], argv.slice(1), { cwd: ROOT, env: environment, timeout, maxBuffer, encoding: "buffer" }, (error, stdout, stderr) => {
      done({ exitCode: error ? (typeof error.code === "number" ? error.code : 1) : 0, stdout, stderr });
    });
  });
}

async function wranglerJson(argv, environment) {
  const result = await run([process.execPath, WRANGLER, ...argv], environment);
  assert.equal(result.exitCode, 0, "Provider read refused");
  return JSON.parse(result.stdout.toString("utf8"));
}

async function managedToken(environment) {
  const value = await wranglerJson(["auth", "token", "--json"], environment);
  assert.ok(typeof value.token === "string" && value.token.length > 0, "Managed provider login is unavailable");
  return value.token;
}

async function providerApi(path, token) {
  const response = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + path, {
    headers: { authorization: "Bearer " + token }, signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json();
  assert.ok(response.ok && body.success === true, "Provider read refused");
  return body.result;
}

/** Output is reduced before use: secret values are never returned by these reads. */
async function collectWebsite(environment, token) {
  const deployment = () => wranglerJson(["deployments", "list", "--config", CONFIG, "--json"], environment);
  const serving = deploymentVersions(await deployment());
  const version = await wranglerJson(["versions", "view", serving.version, "--config", CONFIG, "--json"], environment);
  assert.equal(version.id, serving.version);
  const script = "/workers/scripts/" + WORKER;
  const latest = await providerApi(script + "/versions", token);
  assert.match(latest.items?.[0]?.id ?? "", VERSION);
  const domains = await providerApi("/workers/domains?per_page=100", token);
  assert.ok(Array.isArray(domains) && domains.length < 100, "Custom-domain inventory needs pagination");
  const snapshot = {
    version: serving.version, deployment: serving.deployment,
    message: typeof version.annotations?.["workers/message"] === "string" ? version.annotations["workers/message"] : null,
    bindings: normalizedBindings(version.resources.bindings), runtime: normalizedRuntime(version.resources.script_runtime),
    settings: normalizedSettings(await providerApi(script + "/settings", token)), domains: normalizedDomains(domains, WORKER),
    subdomain: normalizedSubdomain(await providerApi(script + "/subdomain", token)),
    latest_upload_version: latest.items[0].id, latest_upload_is_serving: latest.items[0].id === serving.version,
  };
  assert.deepEqual(deploymentVersions(await deployment()), serving, "Website traffic changed during observation");
  return snapshot;
}

async function inventory(directory, moduleOnly) {
  const rows = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name), stat = await lstat(path);
      assert.ok(!stat.isSymbolicLink() && await realpath(path) === resolve(path));
      if (stat.isDirectory()) await visit(path);
      else if (!moduleOnly || /\.(?:js|mjs)$/u.test(entry.name)) {
        const bytes = await readFile(path);
        rows.push({ name: relative(directory, path).split("\\").join("/"), sha256: hash(bytes), bytes: bytes.length });
      }
    }
  }
  await visit(directory);
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

async function preparedCandidate(options) {
  assert.equal(assertPublishedWebsiteSource(ROOT), options.source, "Checkout is not the reviewed published source");
  const receiptBytes = await readFile(join(ROOT, "dist/website-production-prepared.json"));
  assert.equal(hash(receiptBytes), options.receipt, "Prepared receipt differs");
  assertPreparedReceipt(JSON.parse(receiptBytes.toString("utf8")), options);
  assert.equal(await websiteArtifactDigest(ROOT), options.artifact, "Built artifact differs");
  const config = JSON.parse(await readFile(join(ROOT, CONFIG), "utf8"));
  checkWebsiteProductionConfig(JSON.parse(await readFile(join(ROOT, "wrangler.jsonc"), "utf8")), config);
  const modules = await inventory(join(ROOT, "dist/ssr"), true), client = await inventory(join(ROOT, "dist/client"), false);
  assert.ok(modules.some(row => row.name === "index.js") && client.length > 0);
  return { config, modules, client };
}

async function compiledModules(candidate, versionId, environment, token) {
  const result = await run(["cf", "workers", "versions", "get", versionId, "--worker-id", WORKER, "--include", "modules"],
    { ...environment, CLOUDFLARE_API_TOKEN: token });
  assert.equal(result.exitCode, 0, "Provider module read refused");
  const version = JSON.parse(result.stdout.toString("utf8"));
  assert.equal(version.id, versionId); assert.equal(version.main_module, "index.js", "Provider entry module differs");
  return validateModules(version.modules, candidate.modules);
}

async function servedAssets(candidate) {
  const page = await fetch(ORIGIN + "/", { redirect: "error", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(20_000) });
  assert.equal(page.status, 200, "Public root refused");
  const names = referencedAssets(await page.text()), observed = [];
  for (const name of names) {
    const row = candidate.client.find(item => item.name === name);
    assert.ok(row, "Public HTML references an asset outside the candidate: " + name);
    const response = await fetch(ORIGIN + "/" + name, { redirect: "error", credentials: "omit", cache: "no-store",
      signal: AbortSignal.timeout(20_000), headers: { "accept-encoding": "identity" } });
    assert.equal(response.status, 200, "Candidate asset refused: " + name);
    assert.equal(hash(Buffer.from(await response.arrayBuffer())), row.sha256, "Served asset differs: " + name);
    observed.push(row);
  }
  return observed;
}

async function verifyServing(options, candidate, environment, token, expected) {
  const after = await collectWebsite(environment, token);
  assertServingCandidate(after, options.source, expected);
  const modules = await compiledModules(candidate, after.version, environment, token);
  const assets = await servedAssets(candidate);
  assert.deepEqual(await collectWebsite(environment, token), after, "Website identity changed during readback");
  return { version: after.version, deployment: after.deployment, compiled_module_count: modules.length, compiled_modules_sha256: digest(modules), served_assets: assets };
}

async function main(argv) {
  const options = parseArguments(argv);
  const environment = toolEnvironment();
  const token = await managedToken(environment);
  if (options.mode === "rollback") {
    const before = await collectWebsite(environment, token);
    assert.equal(before.version, options.from, "Serving version is not the version being rolled back");
    writeOnce(options.evidence, "rollback-attempt.json", { at: new Date().toISOString(), from: options.from, to: options.baseline });
    const result = await run(rollbackCommand(process.execPath, WRANGLER, options.baseline), environment, 120_000);
    writeOnce(options.evidence, "rollback-command-result.json", { at: new Date().toISOString(), exit_code: result.exitCode, stdout_sha256: hash(result.stdout), stderr_sha256: hash(result.stderr) });
    assert.equal(result.exitCode, 0, "Rollback command refused or unresolved");
    const after = await collectWebsite(environment, token);
    assert.equal(after.version, options.baseline, "Baseline is not serving after rollback");
    return { rolled_back: true, version: after.version };
  }
  const candidate = await preparedCandidate(options);
  if (options.mode === "verify") {
    const before = await collectWebsite(environment, token);
    const result = await verifyServing(options, candidate, environment, token, digest(comparable(before)));
    writeOnce(options.evidence, "verify-" + Date.now() + ".json", { at: new Date().toISOString(), source: options.source, artifact: options.artifact, ...result });
    return { verified: true, version: result.version, compiled_module_count: result.compiled_module_count, served_assets: result.served_assets.length };
  }
  const before = await collectWebsite(environment, token);
  assertBaseline(before, options.baseline);
  const proposal = bindingProposal(before, candidate.config);
  assertConfigurationUnchanged(proposal, before);
  if (options.mode === "snapshot") {
    return { read_only: true, baseline: before.version, baseline_message: before.message, configuration_sha256: proposal.candidate_sha256,
      binding_count: before.bindings.length, domains: before.domains.map(row => row.hostname), candidate_modules: candidate.modules.length, candidate_client_files: candidate.client.length };
  }
  assert.deepEqual(await collectWebsite(environment, token), before, "Website changed before upload");
  writeOnce(options.evidence, "upload-attempt.json", { at: new Date().toISOString(), source: options.source, artifact: options.artifact, receipt: options.receipt,
    baseline: before.version, rollback_target: before.version, configuration_sha256: proposal.candidate_sha256, node: process.version });
  const result = await run(deployCommand(process.execPath, WRANGLER, options.source), environment, 300_000);
  writeOnce(options.evidence, "upload-command-result.json", { at: new Date().toISOString(), exit_code: result.exitCode, stdout_sha256: hash(result.stdout), stderr_sha256: hash(result.stderr) });
  assert.equal(result.exitCode, 0, "Upload refused or unresolved. Do not retry; run verify");
  const readback = await verifyServing(options, candidate, environment, token, proposal.candidate_sha256);
  writeOnce(options.evidence, "upload-readback.json", { at: new Date().toISOString(), source: options.source, artifact: options.artifact, rollback_target: before.version, ...readback });
  return { uploaded: true, version: readback.version, rollback_target: before.version, compiled_module_count: readback.compiled_module_count, served_assets: readback.served_assets.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(value => console.log(JSON.stringify(value))).catch(error => {
    // Assertion text is authored above; provider output is never echoed.
    console.error(JSON.stringify({ success: false, message: error instanceof assert.AssertionError ? error.message : "Website operation refused or unresolved" }));
    process.exitCode = 1;
  });
}
